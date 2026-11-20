export type LayoutNode =
  | { type: "leaf"; paneId: string }
  | { type: "split"; id: string; dir: "row" | "column"; ratio: number; a: LayoutNode; b: LayoutNode };

export function leaves(n: LayoutNode): string[] {
  return n.type === "leaf" ? [n.paneId] : [...leaves(n.a), ...leaves(n.b)];
}

export function splitLeaf(
  n: LayoutNode,
  paneId: string,
  newPaneId: string,
  dir: "row" | "column",
  splitId: string,
): LayoutNode {
  if (n.type === "leaf") {
    if (n.paneId !== paneId) return n;
    return { type: "split", id: splitId, dir, ratio: 0.5, a: n, b: { type: "leaf", paneId: newPaneId } };
  }
  return {
    ...n,
    a: splitLeaf(n.a, paneId, newPaneId, dir, splitId),
    b: splitLeaf(n.b, paneId, newPaneId, dir, splitId),
  };
}

/** Removes a leaf; the sibling takes the parent's place. Returns null if the tree becomes empty. */
export function removeLeaf(n: LayoutNode, paneId: string): LayoutNode | null {
  if (n.type === "leaf") return n.paneId === paneId ? null : n;
  const a = removeLeaf(n.a, paneId);
  const b = removeLeaf(n.b, paneId);
  if (!a) return b;
  if (!b) return a;
  return { ...n, a, b };
}

export function setRatio(n: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (n.type === "leaf") return n;
  if (n.id === splitId) return { ...n, ratio };
  return { ...n, a: setRatio(n.a, splitId, ratio), b: setRatio(n.b, splitId, ratio) };
}
