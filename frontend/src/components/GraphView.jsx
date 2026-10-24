import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import { formatCompact } from "../lib/format.js";

const STYLE = [
  {
    selector: "node",
    style: {
      "background-color": "#0b1a13",
      "border-width": 1.5,
      "border-color": "#1d5c3d",
      label: "data(label)",
      color: "#9fd7b9",
      "font-family": "ui-monospace, Consolas, monospace",
      "font-size": 8,
      "text-valign": "bottom",
      "text-margin-y": 5,
      width: "data(size)",
      height: "data(size)",
    },
  },
  {
    selector: "node.hot",
    style: {
      "border-color": "#2bd889",
      "background-color": "#0d2418",
    },
  },
  {
    selector: "node.active",
    style: {
      "border-color": "#39ff9e",
      "border-width": 2.5,
      "background-color": "#0f3a26",
      color: "#d9ffec",
      "underlay-color": "#39ff9e",
      "underlay-opacity": 0.18,
      "underlay-padding": 9,
      "font-size": 9,
    },
  },
  { selector: "node.dim", style: { opacity: 0.24 } },
  { selector: "node:active", style: { "overlay-opacity": 0 } },
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": "#1a4a33",
      "target-arrow-color": "#1a4a33",
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.7,
      "curve-style": "bezier",
      opacity: 0.55,
      label: "data(label)",
      "font-size": 7,
      color: "#5fae86",
      "font-family": "ui-monospace, Consolas, monospace",
      "text-rotation": "autorotate",
      "text-background-color": "#050a08",
      "text-background-opacity": 0.85,
      "text-background-padding": 2,
      "text-opacity": 0,
    },
  },
  {
    selector: "edge.active",
    style: {
      "line-color": "#39ff9e",
      "target-arrow-color": "#39ff9e",
      width: 1.8,
      opacity: 0.95,
      color: "#a6ffd5",
      "text-opacity": 0.95,
    },
  },
  { selector: "edge.dim", style: { opacity: 0.09 } },
];

const LAYOUT = {
  name: "cose",
  animate: true,
  animationDuration: 650,
  randomize: true,
  fit: true,
  padding: 46,
  nodeRepulsion: 12000,
  idealEdgeLength: 92,
  edgeElasticity: 100,
  gravity: 0.4,
  nodeOverlap: 18,
  numIter: 1500,
};

function buildElements(alerts) {
  const nodes = new Map();
  const edges = [];

  for (const alert of alerts) {
    const degree = new Map();
    for (const edge of alert.edges ?? []) {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }

    for (const account of alert.accounts ?? []) {
      const size = 22 + Math.min(10, (degree.get(account) ?? 0) * 2.2);
      nodes.set(account, {
        data: { id: account, label: account, ring: alert.ring_id, size },
        classes: alert.risk >= 80 ? "hot" : "",
      });
    }

    (alert.edges ?? []).forEach((edge, index) => {
      edges.push({
        data: {
          id: `${alert.ring_id}-${edge.from}-${edge.to}-${index}`,
          source: edge.from,
          target: edge.to,
          ring: alert.ring_id,
          label: formatCompact(edge.amount),
        },
      });
    });
  }

  return [...nodes.values(), ...edges];
}

export default function GraphView({ alerts, selectedId, onSelectRing }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const alertsRef = useRef(alerts);
  const selectRef = useRef(onSelectRing);
  const firstRender = useRef(true);
  useEffect(() => {
    alertsRef.current = alerts;
    selectRef.current = onSelectRing;
  });

  // The signature keeps polling from re-laying-out unchanged data.
  const signature = JSON.stringify(
    (alerts ?? []).map((alert) => [
      alert.ring_id,
      alert.risk,
      alert.accounts?.length ?? 0,
      alert.edges?.length ?? 0,
      alert.total_amount,
    ]),
  );

  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      style: STYLE,
      elements: [],
      layout: { name: "preset" },
      minZoom: 0.25,
      maxZoom: 2.5,
    });

    cy.on("tap", "node", (event) => {
      const ring = event.target.data("ring");
      if (ring) selectRef.current?.(ring);
    });

    // Keep the graph fitted when the panel changes size (responsive layout).
    const observer = new ResizeObserver(() => {
      cy.resize();
      if (cy.elements().length) cy.fit(undefined, 40);
    });
    observer.observe(containerRef.current);

    cyRef.current = cy;
    return () => {
      observer.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().remove();
    const current = alertsRef.current ?? [];
    if (!current.length) return;
    cy.add(buildElements(current));
    cy.layout(LAYOUT).run();
  }, [signature]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("active dim");
    if (!selectedId) return;
    const ringElements = cy
      .elements()
      .filter((element) => element.data("ring") === selectedId);
    if (!ringElements.length) return;
    cy.elements().difference(ringElements).addClass("dim");
    ringElements.addClass("active");

    // First paint keeps the whole graph in view; zooming happens only when
    // the user actually picks a ring, so both rings stay visible on load.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    cy.animate({
      fit: { eles: ringElements, padding: 44 },
      duration: 450,
      easing: "ease-out",
    });
  }, [selectedId, signature]);

  return <div ref={containerRef} className="graph-canvas" />;
}
