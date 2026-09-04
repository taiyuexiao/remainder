/** Tiptap/ProMirror 节点的最小类型（结构遍历用） */
export interface PMNode {
  type: string;
  text?: string;
  attrs?: Record<string, any>;
  content?: PMNode[];
}
