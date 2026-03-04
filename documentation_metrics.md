# Analyse Spectroscopique MRSI — Grading des Gliomes

> **Contexte applicatif** : Ce document décrit les indicateurs cliniques intégrés dans la plateforme GliomaGuard pour l'interprétation des spectres MRSI. Il justifie le choix des ratios métaboliques, leurs seuils d'alerte, et la construction du score composite de malignité.

---

## 1. Ce qu'on voit dans l'interface

### 1.1 Le spectre MRSI

Quand on clique sur un voxel de l'IRM, la plateforme interroge le backend qui retourne le **spectre de résonance magnétique** de ce voxel — soit le signal FID transformé en fréquence (axe X : ppm, de 5 à 0 par convention).

```
5 ppm ──────────────────────────────────── 0 ppm
      [Lipides/Lac]  [Cho] [Cr] [NAA]
           ↑            ↑    ↑    ↑
      Pathologique    Mb.  Réf. Neurones
```

> **Convention MRS** : l'axe des ppm est **inversé** (valeurs décroissantes de gauche à droite). C'est la norme internationale en spectroscopie RMN médicale.

Chaque pic correspond à un **métabolite** résonnant à une fréquence chimique précise :

| Métabolite | Position (ppm) | Signification biologique |
|------------|----------------|--------------------------|
| NAA | 2.02 | Viabilité neuronale |
| Cr | 3.02 | Métabolisme énergétique (référence) |
| Cho | 3.22 | Turnover membranaire |
| mI | 3.56 | Marqueur glial |
| Glu | 2.35 | Neurotransmetteur excitateur |
| Lac | 1.33 | Anaérobiose / nécrose |

### 1.2 Le panel de résultats inline

Sous le spectre, le panel affiche automatiquement :

1. **Les ratios cliniques** — chaque ratio est coloré selon sa valeur par rapport aux seuils publiés
2. **Le score de malignité gliome** — barre de progression 0→1 synthétisant les ratios pondérés
3. **Les top métabolites** — barres proportionnelles à la concentration relative
4. **Une note clinique contextuelle** — si le profil est suspect ou pathologique

---

## 2. Les ratios métaboliques — définitions et seuils

### 2.1 Cho/NAA — Marqueur principal de malignité

$$\text{Cho/NAA} = \frac{\text{Choline}}{\text{N-Acétyl-Aspartate}}$$

**Pourquoi ce ratio ?**

- La **Choline** (Cho) reflète le **turnover membranaire cellulaire**. Dans les gliomes, la prolifération tumorale entraîne une synthèse accélérée de phospholipides membranaires → Cho **augmente**.
- Le **NAA** est synthétisé *exclusivement* dans les neurones matures et leurs axones. Quand les cellules tumorales envahissent le parenchyme → NAA **diminue**.

Le ratio Cho/NAA combine donc **deux effets opposés et simultanés**, ce qui en fait le marqueur le plus sensible et spécifique pour les gliomes.

| Valeur | Interprétation | Couleur |
|--------|---------------|---------|
| < 1.0 | Normal | 🟢 Vert |
| 1.0 – 1.5 | Zone limite | 🟡 Jaune |
| 1.5 – 2.5 | Suspect haut grade | 🟠 Orange |
| > 2.5 | Haut grade probable | 🔴 Rouge |

> **Références** : Howe et al., *Br J Radiol* 2003 ; McKnight et al., *AJNR* 2002 (sensibilité 90%, spécificité 86% pour Cho/NAA > 2.0)

---

### 2.2 Cho/Cr — Activité tumorale normalisée

$$\text{Cho/Cr} = \frac{\text{Choline}}{\text{Créatine}}$$

**Pourquoi normaliser par la Créatine ?**

La Cr est relativement **homéostatique** dans le tissu cérébral sain (métabolisme énergétique mitochondrial stable). Elle sert de **référence interne** pour corriger les variations d'intensité du signal dues aux conditions d'acquisition (antenne, champ B₁, épaisseur de coupe).

Cho/Cr permet de distinguer :
- Un **hypermétabolisme cholinergique tumoral** réel (Cho↑, Cr stable)
- Des **artefacts techniques** (si Cr varie proportionnellement, le ratio reste stable)

| Valeur | Interprétation | Couleur |
|--------|---------------|---------|
| < 1.2 | Normal | 🟢 Vert |
| 1.2 – 1.5 | Limite | 🟡 Jaune |
| 1.5 – 2.0 | Suspect | 🟠 Orange |
| > 2.0 | Tumoral | 🔴 Rouge |

> **Référence** : Law et al., *Radiology* 2008 (Cho/Cr corrélé à l'indice de prolifération Ki-67 en histologie)

---

### 2.3 NAA/Cr — Perte neuronale

$$\text{NAA/Cr} = \frac{\text{N-Acétyl-Aspartate}}{\text{Créatine}}$$

**Interprétation inverse** : contrairement aux autres ratios, une **baisse** est pathologique.

NAA/Cr mesure directement la **destruction ou le déplacement neuronal** par la tumeur. Ce ratio est particulièrement utile pour différencier :

- **Gliome infiltrant** (NAA/Cr très bas : neurones détruits ou refoulés)
- **Métastase** (NAA/Cr peut rester modérément élevé car la tumeur est souvent entourée d'œdème, pas d'infiltration directe des neurones)
- **Radionécrose post-traitement** vs rechute tumorale (la radionécrose préserve mieux le NAA résiduel)

| Valeur | Interprétation | Couleur |
|--------|---------------|---------|
| > 1.2 | Normal | 🟢 Vert |
| 0.8 – 1.2 | Réduit | 🟠 Orange |
| < 0.8 | Perte neuronale sévère | 🔴 Rouge |

> **Référence** : Horska & Barker, *Neuroimaging Clin N Am* 2011

---

### 2.4 Lac/Cr — Nécrose et anaérobiose

$$\text{Lac/Cr} = \frac{\text{Lactate}}{\text{Créatine}}$$

Le **Lactate** est normalement **absent ou à l'état de trace** dans le cerveau sain (le métabolisme cérébral est aérobie).

Son apparition signale un **métabolisme anaérobie** : la tumeur croît plus vite que sa néo-vascularisation ne peut l'irriguer (effet Warburg).

Implications cliniques :
- Zones nécrotiques centrales → typique du **GBM grade IV** (WHO 2021)
- Hypoxie tumorale → marqueur de **résistance à la radiothérapie** (les cellules hypoxiques sont radiorésistantes)
- **Pronostic indépendant** : Lac/Cr > 0.3 est associé à une survie médiane significativement réduite dans les GBM

| Valeur | Interprétation | Couleur |
|--------|---------------|---------|
| < 0.1 | Normal (trace) | 🟢 Vert |
| 0.1 – 0.3 | Discret | 🟡 Jaune |
| > 0.3 | Nécrose / Haut grade | 🔴 Rouge |

> **Référence** : Perez-Gomez et al., *NMR Biomed* 2003

---

### 2.5 mI/Cr — Gliose et bas grade

$$\text{mI/Cr} = \frac{\text{Myo-inositol}}{\text{Créatine}}$$

Le **Myo-inositol** est un marqueur des **cellules gliales** (astrocytes essentiellement). Son élévation est caractéristique des gliomes de **bas grade** et de la gliose réactionnelle.

Contrairement aux autres ratios, mI/Cr suit une logique **non-monotone** avec la malignité :

```
mI/Cr élevé  →  Bas grade (gliose, Grade II)
mI/Cr bas    →  Haut grade (dédifférenciation cellulaire, Grade III/IV)
```

Ce ratio est un marqueur de **différenciation entre grades**, pas de présence tumorale en soi. Combiné à Cho/NAA il permet de préciser le grade :

| mI/Cr | Cho/NAA | Interprétation probable |
|-------|---------|------------------------|
| Élevé | Modéré (1.0–1.5) | Gliome bas grade (II) |
| Normal | Élevé (> 2.0) | Gliome haut grade (III/IV) |
| Bas | Très élevé | GBM (nécrotique) |

| Valeur | Interprétation | Couleur |
|--------|---------------|---------|
| < 0.4 | Normal | 🟢 Vert |
| 0.4 – 0.7 | Élevé | 🟡 Jaune |
| > 0.7 | Gliose marquée | 🟠 Orange |

> **Référence** : Castillo et al., *AJNR* 2000

---

### 2.6 Glx/Cr — Activité glutamatergique (Glu + Gln)

$$\text{Glx/Cr} = \frac{\text{Glutamate} + \text{Glutamine}}{\text{Créatine}}$$

Le **Glutamate** (Glu) est le principal neurotransmetteur excitateur du SNC. La **Glutamine** (Gln) est sa forme de stockage/transport dans les astrocytes (cycle glutamate-glutamine).

Dans les gliomes :
- Glu est libéré en excès par les cellules tumorales → **excitotoxicité péri-tumorale** (mécanisme des crises d'épilepsie fréquentes dans les gliomes de bas grade)
- Gln est une **source d'énergie alternative** pour les cellules tumorales (glutaminolyse), particulièrement dans les tumeurs à prolifération rapide
- Glx/Cr élevé peut indiquer une **zone d'infiltration péri-tumorale active** non visible à l'IRM conventionnelle

> ⚠️ Ce ratio est encore principalement un **marqueur de recherche** (moins standardisé cliniquement que Cho/NAA). Son interprétation doit rester prudente (c'est pourquoi j'en mentionne rien dans la platforme).

> **Référence** : Unterrainer et al., *J Nucl Med* 2022

---

## 3. Score composite de malignité

### 3.1 Principe

Le score est une **somme pondérée normalisée** des ratios pathologiques, calculée selon leur valeur prédictive publiée.

$$\text{Score} = \frac{\sum_i w_i \cdot s_i}{\sum_i w_i} \in [0, 1]$$

Où $s_i$ est la contribution normalisée de chaque ratio :

| Ratio | Poids $w_i$ | Normalisation $s_i$ | Justification du poids |
|-------|------------|---------------------|------------------------|
| Cho/NAA | 3 | $\min(\text{Cho/NAA} / 2.5, 1)$ | Sensibilité 90% (McKnight 2002) |
| Cho/Cr | 2 | $\min(\text{Cho/Cr} / 2.0, 1)$ | Corrélé au Ki-67 (Law 2008) |
| NAA/Cr | 2 | $\max(0, 1 - \text{NAA/Cr} / 1.5)$ | Perte neuronale inversée |
| Lac/Cr | 1.5 | $\min(\text{Lac/Cr} / 0.3, 1)$ | Pronostic indépendant |

### 3.2 Interprétation du score

| Score | Interprétation | Affichage |
|-------|---------------|-----------|
| 0 – 0.25 | Profil normal | 🟢 Vert |
| 0.25 – 0.50 | Suspect bas grade | 🟡 Jaune |
| 0.50 – 0.75 | Suspect haut grade | 🟠 Orange |
| 0.75 – 1.0 | Haut grade probable | 🔴 Rouge |

### 3.3 Exemple numérique

Pour le voxel (2, 1, 5) visible dans l'interface :

```
NAA   = 0.4280  →  Cho/NAA = PCh/NAA  ≈ 0.105   → s₁ = 0.105/2.5 = 0.042 (×3 = 0.126)
Cr    = 0.2627  →  Cho/Cr  ≈ 0.171   → s₂ = 0.171/2.0 = 0.085 (×2 = 0.170)
                →  NAA/Cr  ≈ 1.630   → s₃ = max(0, 1-1.63/1.5) = 0     (×2 = 0.000)
                →  Lac/Cr  ≈ 0.041   → s₄ = 0.041/0.3 = 0.137          (×1.5 = 0.205)

Score = (0.126 + 0.170 + 0.000 + 0.205) / (3 + 2 + 2 + 1.5) = 0.501 / 8.5 ≈ 0.059
```

→ **Profil normal/bas** pour ce voxel. NAA élevé (bon signe), Lac bas.

---

## 4. Limites et précautions

### 4.1 Ce n'est pas un outil diagnostique autonome

> ⚠️ **Avertissement clinique** : Les seuils implémentés sont issus de la littérature et servent d'**aide à l'interprétation visuelle**. Ils ne remplacent pas :
> - L'analyse anatomique IRM conventionnelle
> - La corrélation clinique (symptômes, évolution)
> - L'histologie (biopsie / pièce opératoire)
> - Le jugement du radiologue ou neuro-oncologue

## 5. Références bibliographiques

1. **McKnight TR** et al. — *Histopathological validation of a three-dimensional magnetic resonance spectroscopy index as a predictor of tumor presence.* J Neurosurg. 2002 ; 97(4):794-802.

2. **Howe FA** et al. — *Metabolic profiles of human brain tumors using quantitative in vivo 1H magnetic resonance spectroscopy.* Magn Reson Med. 2003 ; 49(2):223-232.

3. **Law M** et al. — *Glioma grading: sensitivity, specificity, and predictive values of perfusion MR imaging and proton MR spectroscopic imaging compared with conventional MR imaging.* AJNR. 2003 ; 24(10):1989-1998.

4. **Law M** et al. — *Comparing perfusion metrics obtained from a single compartment versus pharmacokinetic modeling methods using dynamic susceptibility contrast-enhanced perfusion MR imaging with glioma grade.* AJNR. 2004.

5. **Horska A, Barker PB** — *Imaging of brain tumors: MR spectroscopy and metabolic imaging.* Neuroimaging Clin N Am. 2010 ; 20(3):293-310.

6. **Castillo M** et al. — *Proton MR spectroscopy provides specific information about treatment effects in brain neoplasms.* AJNR. 2000 ; 21(4):665-674.

7. **Perez-Gomez M** et al. — *Role of combined diffusion-weighted imaging and 1H MR spectroscopy in the assessment of upper cervical spinal cord tumors.* NMR Biomed. 2003.

8. **Unterrainer M** et al. — *Emerging targets and novel PET tracers for brain tumor imaging.* J Nucl Med. 2022 ; 63(suppl 1):10S-17S.

9. **WHO Classification of Tumours of the Central Nervous System**, 5th edition. IARC Press, Lyon, 2021.

---


*Dernière mise à jour : Mars 2026*