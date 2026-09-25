# Geometric Surface Classification Algorithms

Mini-Segmentor classifies complex 3D meshes (e.g., tabletop miniatures) into distinct painting zones using a fast, multi-stage vectorized geometric pipeline:

## 1. Vectorized Face Normals & Bounding Bounds
For every triangle face $f_i$ with vertices $(\mathbf{a}, \mathbf{b}, \mathbf{c})$:
- Face normal: $\mathbf{n}_i = \frac{(\mathbf{b} - \mathbf{a}) \times (\mathbf{c} - \mathbf{a})}{\|(\mathbf{b} - \mathbf{a}) \times (\mathbf{c} - \mathbf{a})\|}$
- Surface area: $A_i = \frac{1}{2} \|(\mathbf{b} - \mathbf{a}) \times (\mathbf{c} - \mathbf{a})\|$

## 2. 64-Bit Normalized Spatial Hashing
Mesh vertices in STL files are soup vertices without indexing. Vertices are mapped into a discrete integer grid scaled across the bounding box extent:
$$\mathbf{k} = (i_x \ll 42) \mid (i_y \ll 21) \mid i_z$$
This builds a compact half-edge topology with $O(N)$ expected time complexity.

## 3. Dihedral Boundary Detection
Adjacent faces $f_1, f_2$ sharing an edge evaluate dihedral angle $\theta$:
$$\theta = \arccos(\mathbf{n}_1 \cdot \mathbf{n}_2) \times \frac{180}{\pi}$$
Edges where $\theta \ge \theta_{\text{threshold}}$ (default $24^\circ$) are registered as boundary crease features.

## 4. Feature Edge Filtering
- **Length Filtering:** Crease edges are linked into continuous chains. Crease chains with fewer than $N$ edges (default 3) are filtered out to prevent noisy micro-creases from breaking smooth patches.
- **Straightness Ratio:** Chain chord length divided by cumulative arc length filters curvilinear contours when rigid mechanical features are required.

## 5. Breadth-First Search (BFS) Connected Components
Non-boundary faces are partitioned into connected planar/curved patches. Patches exceeding the calibrated area threshold ($\ge 2.0\%$ of total surface area) are classified as **Large Smooth Surfaces**, while smaller patches are classified as **Fine Detail / Textured Surfaces**.

## 6. Iterative Triangle Vote Edge Absorption
Boundary edge faces are absorbed into neighboring resolved patches using a multi-pass shared edge majority vote, avoiding disconnected borders and preserving crisp visual seams.
