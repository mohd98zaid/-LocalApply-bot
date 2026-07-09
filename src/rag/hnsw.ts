// ============================================================
// HNSW Index — Approximate nearest neighbor search
// Replaces flat O(n) cosine scan with graph-based O(log n) search
// src/rag/hnsw.ts
// ============================================================

interface HNSWNode {
  id: string;
  vector: number[];
  level: number;
  neighbors: Map<number, string[]>;
}

export class HNSWIndex {
  private nodes = new Map<string, HNSWNode>();
  private maxLevel = 0;
  private entryPoint: string | null = null;
  private M: number;
  private maxM: number;
  private efConstruction: number;
  private ml: number;

  constructor(M = 16, efConstruction = 100) {
    this.M = M;
    this.maxM = M * 2;
    this.efConstruction = efConstruction;
    this.ml = 1 / Math.log(M);
  }

  add(id: string, vector: number[]): void {
    const level = this.randomLevel();
    const node: HNSWNode = { id, vector, level, neighbors: new Map() };
    for (let l = 0; l <= level; l++) node.neighbors.set(l, []);
    this.nodes.set(id, node);

    if (!this.entryPoint) {
      this.entryPoint = id;
      this.maxLevel = level;
      return;
    }

    let ep = this.entryPoint;
    for (let l = this.maxLevel; l > level; l--) {
      const nearest = this.searchAtLevel(vector, ep, 1, l);
      if (nearest.length) ep = nearest[0].id;
    }

    for (let l = Math.min(level, this.maxLevel); l >= 0; l--) {
      const candidates = this.searchAtLevel(vector, ep, this.efConstruction, l);
      const neighbors = this.selectNeighbors(candidates, this.M);
      node.neighbors.set(l, neighbors.map(n => n.id));

      for (const n of neighbors) {
        const nn = this.nodes.get(n.id)!;
        const nl = nn.neighbors.get(l) || [];
        nl.push(id);
        if (nl.length > this.maxM) {
          const pruned = this.selectNeighbors(
            nl.map(x => ({ id: x, sim: this.cosSim(vector, this.nodes.get(x)!.vector) })),
            this.M
          );
          nn.neighbors.set(l, pruned.map(p => p.id));
        } else {
          nn.neighbors.set(l, nl);
        }
      }
      if (neighbors.length) ep = neighbors[0].id;
    }

    if (level > this.maxLevel) {
      this.entryPoint = id;
      this.maxLevel = level;
    }
  }

  remove(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;

    for (const [level, neighborIds] of node.neighbors) {
      for (const nid of neighborIds) {
        const neighbor = this.nodes.get(nid);
        if (!neighbor) continue;
        const nl = neighbor.neighbors.get(level);
        if (nl) neighbor.neighbors.set(level, nl.filter(x => x !== id));
      }
    }

    this.nodes.delete(id);

    if (this.entryPoint === id) {
      this.entryPoint = this.nodes.size > 0 ? this.nodes.keys().next().value! : null;
      this.maxLevel = this.entryPoint ? this.nodes.get(this.entryPoint)!.level : 0;
    }
  }

  search(query: number[], topK: number, ef = 50): { id: string; similarity: number }[] {
    if (!this.entryPoint) return [];

    let ep = this.entryPoint;
    for (let l = this.maxLevel; l > 0; l--) {
      const nearest = this.searchAtLevel(query, ep, 1, l);
      if (nearest.length) ep = nearest[0].id;
    }

    return this.searchAtLevel(query, ep, ef, 0)
      .slice(0, topK)
      .map(r => ({ id: r.id, similarity: r.sim }));
  }

  get size(): number { return this.nodes.size; }

  clear(): void {
    this.nodes.clear();
    this.entryPoint = null;
    this.maxLevel = 0;
  }

  private searchAtLevel(query: number[], entryId: string, ef: number, level: number) {
    const visited = new Set<string>();
    const entry = this.nodes.get(entryId)!;
    let candidates = [{ id: entryId, sim: this.cosSim(query, entry.vector) }];
    let results = [...candidates];
    visited.add(entryId);

    while (candidates.length) {
      candidates.sort((a, b) => b.sim - a.sim);
      const c = candidates.shift()!;
      if (results.length >= ef && c.sim < results[results.length - 1].sim) break;

      for (const nid of (this.nodes.get(c.id)!.neighbors.get(level) || [])) {
        if (visited.has(nid)) continue;
        visited.add(nid);
        const sim = this.cosSim(query, this.nodes.get(nid)!.vector);
        if (results.length < ef || sim > results[results.length - 1].sim) {
          candidates.push({ id: nid, sim });
          results.push({ id: nid, sim });
          if (results.length > ef) {
            results.sort((a, b) => b.sim - a.sim);
            results.length = ef;
          }
        }
      }
    }
    return results;
  }

  private selectNeighbors(candidates: { id: string; sim: number }[], M: number) {
    return candidates.sort((a, b) => b.sim - a.sim).slice(0, M);
  }

  private randomLevel(): number {
    return Math.floor(-Math.log(Math.random()) * this.ml);
  }

  private cosSim(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const d = Math.sqrt(na) * Math.sqrt(nb);
    return d === 0 ? 0 : dot / d;
  }
}
