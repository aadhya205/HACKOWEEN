import {
  Crosshair,
  Eye,
  EyeOff,
  Maximize,
  RotateCcw,
  Square,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import cytoscape from "cytoscape";
import { useCallback, useEffect, useRef, useState } from "react";
import { useInvestigation } from "../context/InvestigationContext";
import { normalAccounts, normalEdges } from "../data/demoAlerts";

// A compact force layout. The browser build has no async plugin loading, so
// React StrictMode cannot race two instances onto the same container.
function layoutOptions(animate = true) {
  return {
    name: "cose",
    animate,
    animationDuration: 500,
    fit: true,
    padding: 36,
    randomize: true,
    nodeRepulsion: () => 3200,
    idealEdgeLength: () => 55,
    gravity: 1.4,
    nodeOverlap: 4,
    numIter: 1800,
  };
}

export default function NetworkGraph() {
  const { state, dispatch, getSeverity, isAccountFrozen } = useInvestigation();
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [cyLoaded, setCyLoaded] = useState(false);
  const [activeStepInfo, setActiveStepInfo] = useState(null);
  const prevRingIdRef = useRef(null);
  const stateRef = useRef(state);
  const layoutSignatureRef = useRef(null);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Build elements from alerts & background normal network
  const buildElements = useCallback(() => {
    const nodes = new Map();
    const edges = [];

    const selectedRing = state.alerts.find((a) => a.ring_id === state.selectedRingId);
    const selectedAccounts = selectedRing ? new Set(selectedRing.accounts) : new Set();
    const selectedEdgePairs = selectedRing
      ? new Set(selectedRing.edges.map((e) => `${e.from}->${e.to}`))
      : new Set();

    // Add suspicious accounts from all alerts
    state.alerts.forEach((alert) => {
      const severity = getSeverity(alert.risk);
      alert.accounts.forEach((accId) => {
        if (!nodes.has(accId)) {
          const frozen = isAccountFrozen(accId);
          nodes.set(accId, {
            data: {
              id: accId,
              label: frozen ? `❄ ${accId}` : accId,
              suspicious: true,
              frozen,
              severity,
              ringId: alert.ring_id,
              risk: alert.risk,
              inSelectedRing: selectedAccounts.has(accId),
              isSelected: state.selectedAccountId === accId,
            },
          });
        }
      });

      // Add suspicious edges. IDs include the ring and an index: two rings
      // can share the same account pair, and cytoscape rejects duplicate IDs.
      alert.edges.forEach((edge, index) => {
        const edgeId = `${alert.ring_id}:${edge.from}->${edge.to}:${index}`;
        edges.push({
          data: {
            id: edgeId,
            source: edge.from,
            target: edge.to,
            amount: edge.amount,
            suspicious: true,
            ringId: alert.ring_id,
            pair: `${edge.from}->${edge.to}`,
            inSelectedRing: selectedEdgePairs.has(`${edge.from}->${edge.to}`),
          },
        });
      });
    });

    // Add normal accounts (unless user toggled suspiciousOnly view)
    if (!state.suspiciousOnly) {
      normalAccounts.forEach((accId) => {
        if (!nodes.has(accId)) {
          const frozen = isAccountFrozen(accId);
          nodes.set(accId, {
            data: {
              id: accId,
              label: frozen ? `❄ ${accId}` : accId,
              suspicious: false,
              frozen,
              severity: "none",
              ringId: null,
              risk: 0,
              inSelectedRing: false,
              isSelected: state.selectedAccountId === accId,
            },
          });
        }
      });

      normalEdges.forEach((edge, index) => {
        const edgeId = `normal:${edge.from}->${edge.to}:${index}`;
        if (nodes.has(edge.from) && nodes.has(edge.to)) {
          edges.push({
            data: {
              id: edgeId,
              source: edge.from,
              target: edge.to,
              amount: edge.amount,
              suspicious: false,
              ringId: null,
              pair: `${edge.from}->${edge.to}`,
              inSelectedRing: false,
            },
          });
        }
      });
    }

    return [...nodes.values(), ...edges];
  }, [state.alerts, state.selectedRingId, state.selectedAccountId, state.suspiciousOnly, getSeverity, isAccountFrozen]);

  // Initialize Cytoscape instance (synchronous: no mount/import race).
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
        container: containerRef.current,
        elements: buildElements(),
        minZoom: 0.1,
        maxZoom: 4,
        wheelSensitivity: 0.2,
        boxSelectionEnabled: false,
        panningEnabled: true,
        userPanningEnabled: true,
        zoomingEnabled: true,
        userZoomingEnabled: true,
        autoungrabify: false,

        style: [
          // Normal background nodes
          {
            selector: "node[!suspicious]",
            style: {
              width: 32,
              height: 32,
              "background-color": "#0E131D",
              "border-width": 1.5,
              "border-color": "#283244",
              label: "data(label)",
              "font-size": 9,
              "font-family": "'JetBrains Mono', 'SF Mono', monospace",
              "font-weight": 500,
              color: "#8792A5",
              "text-valign": "bottom",
              "text-halign": "center",
              "text-margin-y": 6,
              "text-outline-width": 2,
              "text-outline-color": "#080A0F",
              "text-outline-opacity": 0.9,
              "overlay-opacity": 0,
              "transition-property": "opacity, border-color, background-color",
              "transition-duration": "0.3s",
            },
          },

          // Suspicious nodes (base)
          {
            selector: "node[?suspicious]",
            style: {
              width: 40,
              height: 40,
              "background-color": "#1C0A12",
              "border-width": 2,
              "border-color": "#FF365D",
              label: "data(label)",
              "font-size": 10,
              "font-family": "'JetBrains Mono', 'SF Mono', monospace",
              "font-weight": 600,
              color: "#E8EDF5",
              "text-valign": "bottom",
              "text-halign": "center",
              "text-margin-y": 7,
              "text-outline-width": 2,
              "text-outline-color": "#080A0F",
              "text-outline-opacity": 0.95,
              "overlay-opacity": 0,
              "transition-property": "opacity, border-color, border-width, width, height, background-color",
              "transition-duration": "0.3s",
            },
          },

          // Frozen nodes (amber/icy halo)
          {
            selector: "node[?frozen]",
            style: {
              "border-color": "#FFB547",
              "border-style": "dashed",
              "border-width": 2.5,
              "background-color": "#231808",
              color: "#FFB547",
            },
          },

          // Nodes in the currently selected ring
          {
            selector: "node[?inSelectedRing]",
            style: {
              "border-width": 3,
              "border-color": "#FF365D",
              width: 46,
              height: 46,
              "background-color": "#2E0A16",
              "font-size": 11,
              "font-weight": 700,
              color: "#FFFFFF",
            },
          },

          // Individually clicked node
          {
            selector: "node[?isSelected]",
            style: {
              "border-color": "#56E5FF",
              "border-width": 3.5,
              width: 50,
              height: 50,
              "background-color": "#08212A",
              color: "#56E5FF",
            },
          },

          // Normal background edges
          {
            selector: "edge[!suspicious]",
            style: {
              width: 1,
              "line-color": "#222A38",
              "target-arrow-color": "#222A38",
              "target-arrow-shape": "triangle",
              "arrow-scale": 0.8,
              "curve-style": "bezier",
              opacity: 0.5,
              "overlay-opacity": 0,
              "transition-property": "opacity, line-color",
              "transition-duration": "0.3s",
            },
          },

          // Suspicious edges (unselected ring)
          {
            selector: "edge[?suspicious]",
            style: {
              width: 1.5,
              "line-color": "#7A1C2E",
              "target-arrow-color": "#7A1C2E",
              "target-arrow-shape": "triangle",
              "arrow-scale": 0.85,
              "curve-style": "bezier",
              opacity: 0.65,
              "overlay-opacity": 0,
              "transition-property": "opacity, line-color, width",
              "transition-duration": "0.3s",
            },
          },

          // Suspicious edges in the actively selected ring
          {
            selector: "edge[?inSelectedRing]",
            style: {
              width: 2.8,
              "line-color": "#FF365D",
              "target-arrow-color": "#FF365D",
              "target-arrow-shape": "triangle",
              "arrow-scale": 1.1,
              opacity: 1,
              "curve-style": "bezier",
              "line-style": "dashed",
              "line-dash-pattern": [6, 4],
            },
          },
        ],

        layout: layoutOptions(false),
      });

    cyRef.current = cy;
    layoutSignatureRef.current = buildElements()
      .map((element) => element.data.id)
      .sort()
      .join("|");
    setCyLoaded(true);

    // Node selection. Read state from a ref so the handler never sees the
    // mount-time selection (the old closure caused stale ring switches).
    cy.on("tap", "node", (evt) => {
      const nodeData = evt.target.data();
      dispatch({ type: "SELECT_ACCOUNT", payload: nodeData.id });
      if (nodeData.ringId && nodeData.ringId !== stateRef.current.selectedRingId) {
        dispatch({ type: "SELECT_RING", payload: nodeData.ringId });
      }
    });

    // Background click: deselect
    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        dispatch({ type: "DESELECT_ALL" });
      }
    });

    // Edge hover inspection tooltip
    cy.on("mouseover", "edge", (evt) => {
      const edge = evt.target;
      const pos = edge.renderedMidpoint();
      setTooltip({
        x: pos.x,
        y: pos.y,
        from: edge.data("source"),
        to: edge.data("target"),
        amount: edge.data("amount"),          suspicious: edge.data("suspicious"),
          ringId: edge.data("ringId"),
          width: containerRef.current?.clientWidth ?? 320,
        });
      });

    cy.on("mouseout", "edge", () => {
      setTooltip(null);
    });

    cy.on("pan zoom", () => {
      setTooltip(null);
    });

    // Remember real user gestures so a resize does not yank the camera back.
    const markInteraction = () => {
      userInteractedRef.current = true;
    };
    const container = containerRef.current;
    container.addEventListener("wheel", markInteraction, { passive: true });
    container.addEventListener("mousedown", markInteraction);
    container.addEventListener("touchstart", markInteraction, { passive: true });

    // Keep the canvas sized to its flex parent; fit only until the user pans.
    const observer = new ResizeObserver(() => {
      cy.resize();
      if (!userInteractedRef.current && cy.elements().length) {
        cy.fit(undefined, 48);
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      container.removeEventListener("wheel", markInteraction);
      container.removeEventListener("mousedown", markInteraction);
      container.removeEventListener("touchstart", markInteraction);
      cy.destroy();
      cyRef.current = null;
      setCyLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update elements when alerts, filter, or selection changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const elements = buildElements();

    cy.batch(() => {
      const newIds = new Set(elements.map((el) => el.data.id));
      cy.elements().forEach((el) => {
        if (!newIds.has(el.id())) {
          el.remove();
        }
      });

      elements.forEach((el) => {
        const existing = cy.getElementById(el.data.id);
        if (existing.length > 0) {
          existing.data(el.data);
        } else {
          cy.add(el);
        }
      });
    });

    // Re-run the layout when the node/edge set actually changes (backend data
    // arriving, the suspicious-only filter, a new ring) — not on every poll
    // or click, which is what used to jump the camera around.
    const signature = elements
      .map((element) => element.data.id)
      .sort()
      .join("|");
    if (signature !== layoutSignatureRef.current) {
      layoutSignatureRef.current = signature;
      userInteractedRef.current = false;
      cy.resize();
      cy.layout(layoutOptions(true)).run();
    }

    // Dim non-ring elements when a ring is active
    if (state.selectedRingId) {
      cy.batch(() => {
        cy.nodes().forEach((n) => {
          if (!n.data("inSelectedRing") && !n.data("isSelected")) {
            n.style("opacity", 0.18);
          } else {
            n.style("opacity", 1);
          }
        });
        cy.edges().forEach((e) => {
          if (!e.data("inSelectedRing")) {
            e.style("opacity", 0.08);
          } else {
            e.style("opacity", 1);
          }
        });
      });
    } else {
      cy.batch(() => {
        cy.nodes().style("opacity", 1);
        cy.edges().forEach((e) => {
          e.style("opacity", e.data("suspicious") ? 0.65 : 0.5);
        });
      });
    }
  }, [buildElements, state.selectedRingId, state.selectedAccountId]);

  // Cinematic Ring Illumination Sequence
  // Triggered when a new suspicious ring is selected
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !state.selectedRingId) {
      // Deselecting clears the memory, so re-selecting the same ring later
      // still runs the camera focus and illumination sequence.
      prevRingIdRef.current = null;
      return;
    }

    // Check if this is a newly selected ring
    if (prevRingIdRef.current === state.selectedRingId) return;
    prevRingIdRef.current = state.selectedRingId;

    const ring = state.alerts.find((a) => a.ring_id === state.selectedRingId);
    if (!ring) return;

    const ringNodes = cy.nodes("[?inSelectedRing]");
    const ringEdges = cy.edges("[?inSelectedRing]");

    // Smooth camera center on the ring cluster
    if (ringNodes.length > 0) {
      cy.animate(
        {
          fit: {
            eles: ringNodes.union(ringEdges),
            padding: 80,
          },
        },
        { duration: 450, easing: "ease-out-cubic" }
      );
    }

    // Step 1: Temporarily dim all ring nodes to prep for 1-by-1 illumination
    cy.batch(() => {
      ringNodes.forEach((n) => {
        n.style({
          width: 34,
          height: 34,
          "border-color": "#5A1624",
          "background-color": "#12050A",
        });
      });
      ringEdges.forEach((e) => {
        e.style({
          width: 1.5,
          "line-color": "#5A1624",
          opacity: 0.3,
        });
      });
    });

    // Step 2: Illuminate accounts one by one
    const timers = [];
    ring.accounts.forEach((accId, idx) => {
      const t = setTimeout(() => {
        const node = cy.getElementById(accId);
        if (node.length) {
          // Pulse flash cyan -> settling into neon red
          node
            .animate(
              {
                style: {
                  width: 52,
                  height: 52,
                  "border-color": "#56E5FF",
                  "border-width": 4,
                  "background-color": "#0F2833",
                },
              },
              { duration: 180, easing: "ease-out-cubic" }
            )
            .animate(
              {
                style: {
                  width: 46,
                  height: 46,
                  "border-color": "#FF365D",
                  "border-width": 3,
                  "background-color": "#2E0A16",
                },
              },
              { duration: 220, easing: "ease-in-cubic" }
            );
        }
      }, idx * 110);
      timers.push(t);
    });

    // Step 3: Highlight transfers in glowing red connecting those accounts.
    // Use the actual elements for this ring (edge IDs include the ring and an
    // index, because several rings can share the same from->to pair).
    const edgeStartDelay = ring.accounts.length * 110;
    ring.edges.forEach((edge, idx) => {
      const t = setTimeout(() => {
        const edgeEl = ringEdges[idx];
        if (edgeEl) {
          edgeEl.animate(
            {
              style: {
                width: 3.2,
                "line-color": "#FF365D",
                "target-arrow-color": "#FF365D",
                opacity: 1,
              },
            },
            { duration: 250, easing: "ease-out-cubic" }
          );
        }
      }, edgeStartDelay + idx * 90);
      timers.push(t);
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [state.selectedRingId, state.alerts]);

  // Sequential Trace Money Flow Controller
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !state.tracingFlow || !state.selectedRingId) {
      setActiveStepInfo(null);
      return;
    }

    const ring = state.alerts.find((a) => a.ring_id === state.selectedRingId);
    if (!ring || ring.edges.length === 0) return;

    let currentStep = 0;
    const edgeCount = ring.edges.length;

    // The edge elements for this ring, in the same order as ring.edges.
    const traceEdges = cy.edges().filter((e) => e.data("ringId") === ring.ring_id);

    // Reset ring edges to dim path first
    cy.batch(() => {
      traceEdges.forEach((el) => {
        el.style({ width: 1.5, "line-color": "#5A1624", opacity: 0.35 });
      });
    });

    const stepInterval = setInterval(() => {
      if (currentStep >= edgeCount) {
        // Complete cycle: illuminate all edges in ring and reset active step indicator
        cy.batch(() => {
          traceEdges.forEach((el) => {
            el.style({ width: 2.8, "line-color": "#FF365D", opacity: 1 });
          });
        });
        setActiveStepInfo({ step: edgeCount, total: edgeCount, completed: true });
        clearInterval(stepInterval);
        return;
      }

      const activeEdge = ring.edges[currentStep];
      const edgeEl = traceEdges[currentStep];

      dispatch({ type: "SET_TRACE_STEP", payload: currentStep });
      setActiveStepInfo({
        step: currentStep + 1,
        total: edgeCount,
        from: activeEdge.from,
        to: activeEdge.to,
        amount: activeEdge.amount,
      });

      if (edgeEl.length) {
        // Flash edge with bright electric cyan line then transition to glowing neon red
        edgeEl
          .animate(
            {
              style: {
                width: 4,
                "line-color": "#56E5FF",
                "target-arrow-color": "#56E5FF",
                opacity: 1,
              },
            },
            { duration: 250, easing: "ease-out-cubic" }
          )
          .animate(
            {
              style: {
                width: 3.2,
                "line-color": "#FF365D",
                "target-arrow-color": "#FF365D",
                opacity: 1,
              },
            },
            { duration: 350, easing: "ease-in-cubic" }
          );

        // Pulse source node
        const sourceNode = cy.getElementById(activeEdge.from);
        if (sourceNode.length) {
          sourceNode
            .animate(
              { style: { "border-color": "#56E5FF", width: 50, height: 50 } },
              { duration: 200 }
            )
            .animate(
              { style: { "border-color": "#FF365D", width: 46, height: 46 } },
              { duration: 250 }
            );
        }

        // Pulse destination node
        const targetNode = cy.getElementById(activeEdge.to);
        if (targetNode.length) {
          setTimeout(() => {
            targetNode
              .animate(
                { style: { "border-color": "#FF365D", width: 52, height: 52 } },
                { duration: 200 }
              )
              .animate(
                { style: { "border-color": "#FF365D", width: 46, height: 46 } },
                { duration: 250 }
              );
          }, 200);
        }
      }

      currentStep++;
    }, 750);

    return () => {
      clearInterval(stepInterval);
      // Leaving trace mode must not leave half-highlighted edges behind.
      traceEdges.forEach((el) => {
        if (el.length) {
          el.style({ width: 2.8, "line-color": "#FF365D", opacity: 1 });
        }
      });
    };
  }, [state.tracingFlow, state.selectedRingId, state.alerts, dispatch]);

  // Moving dash animation for suspicious edges in the selected ring
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !state.selectedRingId) return;

    let offset = 0;
    const interval = setInterval(() => {
      offset = (offset + 2) % 20;
      cy.batch(() => {
        cy.edges("[?inSelectedRing]").forEach((e) => {
          e.style("line-dash-offset", -offset);
        });
      });
    }, 75);

    return () => clearInterval(interval);
  }, [cyLoaded, state.selectedRingId]);

  // Graph toolbar actions. Zoom around the viewport centre, not the graph
  // origin, which is what made the old buttons throw the network off-screen.
  const zoomAtCenter = (factor) => {
    const cy = cyRef.current;
    const container = containerRef.current;
    if (!cy || !container) return;
    userInteractedRef.current = true;
    const level = Math.min(
      cy.maxZoom(),
      Math.max(cy.minZoom(), cy.zoom() * factor)
    );
    cy.zoom({
      level,
      renderedPosition: {
        x: container.clientWidth / 2,
        y: container.clientHeight / 2,
      },
    });
  };

  const handleZoomIn = () => zoomAtCenter(1.35);
  const handleZoomOut = () => zoomAtCenter(1 / 1.35);

  const handleFit = () => {
    const cy = cyRef.current;
    if (!cy || !cy.elements().length) return;
    userInteractedRef.current = false;
    cy.animate({ fit: { padding: 50 } }, { duration: 300, easing: "ease-out" });
  };

  const handleFocusRing = () => {
    const cy = cyRef.current;
    if (!cy || !state.selectedRingId) return;
    const ringEles = cy
      .nodes("[?inSelectedRing]")
      .union(cy.edges("[?inSelectedRing]"));
    if (ringEles.length) {
      userInteractedRef.current = true;
      cy.animate({ fit: { eles: ringEles, padding: 60 } }, { duration: 400 });
    }
  };

  const handleReset = () => {
    const cy = cyRef.current;
    if (!cy || !cy.elements().length) return;
    userInteractedRef.current = false;
    const layout = cy.layout(layoutOptions(true));
    layout.one("layoutstop", () => cy.fit(undefined, 50));
    layout.run();
  };

  return (
    <div className="graph-container">
      {/* Visual cyber scan line overlay */}
      <div className="scan-indicator" />

      {/* Floating Toolbar */}
      <div className="graph-toolbar">
        <button
          type="button"
          className="graph-toolbar-btn"
          onClick={handleZoomIn}
          disabled={!cyLoaded}
          title="Zoom In"
          aria-label="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className="graph-toolbar-btn"
          onClick={handleZoomOut}
          disabled={!cyLoaded}
          title="Zoom Out"
          aria-label="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <button
          type="button"
          className="graph-toolbar-btn"
          onClick={handleFit}
          disabled={!cyLoaded}
          title="Fit Network to Viewport"
          aria-label="Fit network to viewport"
        >
          <Maximize size={14} />
        </button>
        {state.selectedRingId && (
          <button
            type="button"
            className="graph-toolbar-btn active"
            onClick={handleFocusRing}
            disabled={!cyLoaded}
            title="Focus On Active Fraud Ring"
            aria-label="Focus on active fraud ring"
          >
            <Crosshair size={14} />
          </button>
        )}
        <button
          type="button"
          className="graph-toolbar-btn"
          onClick={handleReset}
          disabled={!cyLoaded}
          title="Re-layout & Reset Positions"
          aria-label="Re-layout and reset positions"
        >
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          className={`graph-toolbar-btn ${state.suspiciousOnly ? "active" : ""}`}
          onClick={() => dispatch({ type: "TOGGLE_SUSPICIOUS_ONLY" })}
          title={state.suspiciousOnly ? "Show Full Network (Including Benign Nodes)" : "Filter to Suspicious Nodes Only"}
          aria-label={state.suspiciousOnly ? "Show full network" : "Show suspicious only"}
        >
          {state.suspiciousOnly ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      {/* Top Overlay Badges */}
      <div className="graph-label">
        <span className={`label-tag ${state.dataSource === "backend" ? "live" : "demo"}`}>
          {state.dataSource === "backend" ? "LIVE API" : "DEMO DATA"}
        </span>
        <span className="label-tag">
          {state.suspiciousOnly ? "SUSPICIOUS CLUSTERS ONLY" : "FULL FORENSIC LEDGER"}
        </span>
        {state.selectedRingId && (
          <span className="label-tag" style={{ color: "var(--red)", borderColor: "var(--red-glow-strong)" }}>
            CLUSTER: {state.selectedRingId}
          </span>
        )}
      </div>

      {/* Trace Progress Banner */}
      {state.tracingFlow && activeStepInfo && (
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(16, 20, 29, 0.92)",
            border: "1px solid var(--cyan)",
            boxShadow: "0 0 20px rgba(86, 229, 255, 0.25)",
            backdropFilter: "blur(8px)",
            borderRadius: "var(--radius-md)",
            padding: "8px 16px",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: activeStepInfo.completed ? "var(--green)" : "var(--cyan)",
              boxShadow: `0 0 8px ${activeStepInfo.completed ? "var(--green)" : "var(--cyan)"}`,
              animation: "pulse 1.2s infinite",
            }}
          />
          {activeStepInfo.completed ? (
            <span style={{ color: "var(--green)" }}>Flow Tracing Complete: All Hops Visualized</span>
          ) : (
            <span>
              Tracing Hop <strong style={{ color: "var(--cyan)" }}>{activeStepInfo.step}</strong> of{" "}
              {activeStepInfo.total}: {activeStepInfo.from} → {activeStepInfo.to} ($
              {activeStepInfo.amount?.toLocaleString()})
            </span>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => dispatch({ type: "STOP_TRACE" })}
            style={{ padding: "2px 6px", fontSize: "10px", marginLeft: "8px" }}
          >
            <Square size={10} /> Stop
          </button>
        </div>
      )}

      {/* Cytoscape Canvas Container */}
      <div ref={containerRef} className="cytoscape-container" />

      {/* Interactive Edge Tooltip */}
      {tooltip && (
        <div
          className="graph-tooltip"
          style={{
            left: Math.max(
              8,
              Math.min(
                tooltip.x + 12,
                tooltip.width - 300
              )
            ),
            top: Math.max(8, tooltip.y - 30),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "var(--text-secondary)" }}>{tooltip.from}</span>
            <span style={{ color: tooltip.suspicious ? "var(--red)" : "var(--cyan)" }}>➔</span>
            <span style={{ color: "var(--text-secondary)" }}>{tooltip.to}</span>
          </div>
          <div style={{ marginTop: "3px", fontWeight: 700, color: tooltip.suspicious ? "var(--red)" : "var(--text-primary)" }}>
            ${tooltip.amount.toLocaleString()}
            {tooltip.suspicious && (
              <span
                style={{
                  marginLeft: "8px",
                  fontSize: "9px",
                  padding: "1px 4px",
                  borderRadius: "2px",
                  background: "var(--red-glow)",
                  border: "1px solid var(--red)",
                }}
              >
                FLAGGED
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
