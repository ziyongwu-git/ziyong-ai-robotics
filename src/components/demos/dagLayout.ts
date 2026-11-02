/**
 * Left-to-right layout for the notebook DAG, in the style of Airflow's graph view.
 * The page calls this for presets and for the Tidy button. It does not run a task.
 */
import dagre from '@dagrejs/dagre';
import type { NotebookGraph } from './notebook';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 96;

export function layoutGraph(graph: NotebookGraph): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 72 });
  for (const node of graph.nodes) g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const edge of graph.edges) {
    if (graph.nodes.some((node) => node.id === edge.source) && graph.nodes.some((node) => node.id === edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }
  dagre.layout(g);
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of graph.nodes) {
    const placed = g.node(node.id);
    positions[node.id] = placed
      ? { x: placed.x - NODE_WIDTH / 2, y: placed.y - NODE_HEIGHT / 2 }
      : { x: 40, y: 40 };
  }
  return positions;
}
