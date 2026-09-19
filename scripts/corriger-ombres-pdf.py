#!/usr/bin/env python3
"""
Corrige les ombres d'un PDF pour que le moteur d'Apple les dessine comme Chrome.

POURQUOI (19-09-2026)
La documentation du site, imprimée en PDF depuis Chrome, s'affichait avec un
carré sombre derrière le logo et des pavés gris derrière les maquettes dans
Safari, Aperçu et tous les navigateurs sur iPhone — alors que Chrome sur Mac
l'affichait proprement. Même fichier, deux apparences : l'utilisatrice a cru,
logiquement, à deux versions.

Cause : Chrome (Skia) dessine les ombres CSS avec un « masque doux » de type
Luminosity, dont la zone (/BBox) est exprimée dans ses unités internes (échelle
0,24). Le moteur PDF d'Apple (CoreGraphics) borne ce masque au rectangle de la
page, mais mesuré dans ces unités-là : dès que la /BBox en déborde, il ignore le
masque et peint l'ombre en rectangle plein.

Correction, mathématiquement équivalente : chaque groupe de masque fautif est
ramené dans les coordonnées de la page (contenu préfixé par la matrice en
vigueur, /BBox transformée), et l'installation du masque se fait sous la
matrice identité, la matrice étant rétablie juste après. PDFium et MuPDF
dessinent exactement la même chose qu'avant ; Apple dessine enfin l'ombre.

USAGE
    python3 scripts/corriger-ombres-pdf.py entree.pdf sortie.pdf   # corrige
    python3 scripts/corriger-ombres-pdf.py --verifier fichier.pdf  # contrôle seul

Code de sortie non nul si des ombres fautives subsistent ou si la correction
changerait le rendu MuPDF ou le texte : rien n'est alors écrit.
Nécessite PyMuPDF (`import fitz`).
"""
import re
import sys

import fitz

NOMBRE = rb'[-+]?(?:\d+\.?\d*|\.\d+)'


def multiplier(m, n):
    """Produit de matrices PDF [a b c d e f] : m puis n."""
    a, b, c, d, e, f = m
    A, B, C, D, E, F = n
    return (a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D,
            e * A + f * C + E, e * B + f * D + F)


def inverser(m):
    a, b, c, d, e, f = m
    det = a * d - b * c
    return (d / det, -b / det, -c / det, a / det,
            (c * f - d * e) / det, (b * e - a * f) / det)


def ecrire(m):
    return ' '.join(('%.8f' % (v + 0.0)).rstrip('0').rstrip('.') or '0' for v in m)


def masques_luminosity(doc, page):
    """{nom de ressource ExtGState: (xref ExtGState, xref groupe du masque)} pour la page."""
    res = {}
    cle = doc.xref_get_key(page.xref, 'Resources/ExtGState')
    texte = cle[1]
    if cle[0] == 'xref':
        texte = doc.xref_object(int(texte.split()[0]), compressed=False)
    for nom, xr in re.findall(r'/(\w+)\s+(\d+)\s+0\s+R', texte):
        o = doc.xref_object(int(xr), compressed=False)
        if '/Luminosity' in o:
            g = re.search(r'/G\s+(\d+)\s+0\s+R', o)
            if g:
                res[nom] = (int(xr), int(g.group(1)))
    return res


def bbox(doc, xr):
    v = doc.xref_get_key(xr, 'BBox')[1].strip('[] ').split()
    return [float(x) for x in v]


def fautif(doc, page, groupe):
    """Apple borne le masque au rectangle de la page, dans les unités du masque."""
    x0, y0, x1, y1 = bbox(doc, groupe)
    W, H = page.mediabox.width, page.mediabox.height
    return x0 < -0.5 or y0 < -0.5 or x1 > W + 0.5 or y1 > H + 0.5


def ctm_aux_appels(contenu, noms):
    """Matrice en vigueur à chaque `/Nom gs` visé, en suivant q / Q / cm."""
    pile, m, trouves = [], (1, 0, 0, 1, 0, 0), []
    jetons = re.finditer(rb'\((?:\\.|[^\\)])*\)|<[^<>]*>|/[^\s/\[\]()<>{}]+|' + NOMBRE + rb'|[A-Za-z\'"*]+|\S', contenu)
    derniers = []
    for j in jetons:
        t = j.group(0)
        if t == b'q':
            pile.append(m)
        elif t == b'Q':
            m = pile.pop() if pile else m
        elif t == b'cm' and len(derniers) >= 6:
            m = multiplier(tuple(float(x) for x in derniers[-6:]), m)
        elif t == b'gs' and derniers and derniers[-1].startswith(b'/'):
            nom = derniers[-1][1:].decode('latin-1')
            if nom in noms:
                trouves.append((nom, j.start() - len(derniers[-1]) - 1, j.end(), m))
        derniers = (derniers + [t])[-6:] if re.fullmatch(NOMBRE, t) or t.startswith(b'/') else []
    return trouves


def diagnostiquer(doc):
    fautes = []
    for page in doc:
        for nom, (gs, groupe) in masques_luminosity(doc, page).items():
            if fautif(doc, page, groupe):
                fautes.append((page.number, nom, gs, groupe))
    return fautes


def corriger(doc):
    corriges = set()
    for page in doc:
        cibles = {n: v for n, v in masques_luminosity(doc, page).items() if fautif(doc, page, v[1])}
        if not cibles:
            continue
        xrs = page.get_contents()
        contenu = b''.join(doc.xref_stream(x) for x in xrs)
        appels = ctm_aux_appels(contenu, cibles)
        # Un même groupe utilisé sous deux matrices différentes ne peut pas être
        # ramené dans un seul repère : on refuse plutôt que de deviner.
        par_nom = {}
        for nom, _, _, m in appels:
            par_nom.setdefault(nom, set()).add(tuple(round(v, 6) for v in m))
        for nom, (gs, groupe) in cibles.items():
            if len(par_nom.get(nom, ())) != 1:
                raise SystemExit(f'page {page.number + 1} : /{nom} utilisé sous {len(par_nom.get(nom, ()))} matrices — correction refusée')
        # Réécriture du contenu de la page, de la fin vers le début.
        for nom, debut, fin, m in sorted(appels, key=lambda a: a[1], reverse=True):
            contenu = (contenu[:debut] + f'{ecrire(inverser(m))} cm\n'.encode()
                       + contenu[debut:fin] + f'\n{ecrire(m)} cm'.encode() + contenu[fin:])
        doc.update_stream(xrs[0], contenu)
        for x in xrs[1:]:
            doc.update_stream(x, b'')
        # Groupes de masque ramenés dans le repère de la page.
        for nom, (gs, groupe) in cibles.items():
            if groupe in corriges:
                continue
            m = next(iter(par_nom[nom]))
            x0, y0, x1, y1 = bbox(doc, groupe)
            a, b, c, d, e, f = m
            pts = [(a * x + c * y + e, b * x + d * y + f) for x in (x0, x1) for y in (y0, y1)]
            nb = (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
            # Une ombre peut déborder réellement de la page (élément posé près
            # du bord). Ce débord est invisible par définition, mais Apple
            # refuserait encore le masque : on découpe sa zone au bord de la
            # page. Le garde-fou de rendu plus bas vérifie que rien ne change.
            W, H = page.mediabox.width, page.mediabox.height
            nb = (max(nb[0], 0), max(nb[1], 0), min(nb[2], W), min(nb[3], H))
            doc.update_stream(groupe, f'{ecrire(m)} cm\n'.encode() + doc.xref_stream(groupe))
            doc.xref_set_key(groupe, 'BBox', '[%s]' % ecrire(nb))
            corriges.add(groupe)
    return corriges


def empreinte_rendu(doc):
    return [doc[i].get_pixmap(dpi=60).samples for i in range(len(doc))]


def main():
    if len(sys.argv) == 3 and sys.argv[1] == '--verifier':
        fautes = diagnostiquer(fitz.open(sys.argv[2]))
        for p, nom, gs, g in fautes:
            print(f'  page {p + 1} : ombre /{nom} (ExtGState {gs}, groupe {g}) mal dessinée par Apple')
        print(('✖ %d ombre(s) fautive(s)' % len(fautes)) if fautes else '✓ aucune ombre fautive')
        sys.exit(1 if fautes else 0)
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    entree, sortie = sys.argv[1], sys.argv[2]
    avant = fitz.open(entree)
    texte, rendu = [p.get_text() for p in avant], empreinte_rendu(avant)
    doc = fitz.open(entree)
    n = corriger(doc)
    reste = diagnostiquer(doc)
    # Garde-fous : rien n'est écrit si le rendu ou le texte change.
    if [p.get_text() for p in doc] != texte:
        raise SystemExit('✖ le texte changerait — rien n\'est écrit')
    if empreinte_rendu(doc) != rendu:
        raise SystemExit('✖ le rendu MuPDF changerait — rien n\'est écrit')
    if reste:
        raise SystemExit(f'✖ {len(reste)} ombre(s) fautive(s) subsistent — rien n\'est écrit')
    doc.save(sortie, garbage=1, deflate=True)
    print(f'✓ {len(n)} groupe(s) de masque corrigé(s) ; texte et rendu MuPDF inchangés → {sortie}')


if __name__ == '__main__':
    main()
