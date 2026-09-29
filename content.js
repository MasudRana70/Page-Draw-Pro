(function () {
  if (window.__pdp_initialized) return;
  window.__pdp_initialized = true;

  let active = false;
  let currentTool = "pen";
  let strokeWidth = 3;
  const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"];
  let activeColorIndex = 0;

  let strokes = [];
  let undoStack = [];
  let redoStack = [];

  let currentStroke = null;
  let selectionBox = null;
  let selectedStrokeIds = new Set();
  let isDraggingSelection = false;
  let dragStartPos = null;

  let hostEl = null;
  let shadowRoot = null;
  let canvas = null;
  let ctx = null;
  let renderPending = false;

  function initUI() {
    hostEl = document.createElement("div");
    hostEl.id = "pdp-root";
    hostEl.style.position = "fixed";
    hostEl.style.top = "0";
    hostEl.style.left = "0";
    hostEl.style.width = "100vw";
    hostEl.style.height = "100vh";
    hostEl.style.pointerEvents = "none";
    hostEl.style.zIndex = "2147483647";

    shadowRoot = hostEl.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      .pdp-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
      .pdp-toolbar { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; background: rgba(18, 18, 20, 0.92); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.12); padding: 6px 12px; border-radius: 30px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); pointer-events: auto; cursor: move; z-index: 10; transition: opacity 0.2s; }
      .pdp-group { display: flex; align-items: center; gap: 6px; border-right: 1px solid rgba(255, 255, 255, 0.12); padding-right: 8px; }
      .pdp-btn { background: transparent; border: none; color: #a1a1aa; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s ease; font-size: 13px; font-weight: 600; }
      .pdp-btn:hover { background: rgba(255, 255, 255, 0.1); color: #ffffff; }
      .pdp-btn.active { background: #3b82f6; color: #ffffff; }
      .pdp-color-swatch { width: 20px; height: 20px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: transform 0.15s; }
      .pdp-color-swatch:hover { transform: scale(1.15); }
      .pdp-color-swatch.active { border-color: #ffffff; transform: scale(1.2); box-shadow: 0 0 8px rgba(255, 255, 255, 0.4); }
      .pdp-slider { width: 55px; accent-color: #3b82f6; cursor: pointer; }
      .pdp-badge { font-weight: 800; font-size: 12px; letter-spacing: 1px; color: #3b82f6; padding-left: 4px; padding-right: 2px; }
    `;

    canvas = document.createElement("canvas");
    canvas.className = "pdp-canvas";
    ctx = canvas.getContext("2d");

    const toolbar = document.createElement("div");
    toolbar.className = "pdp-toolbar";

    let isDraggingToolbar = false;
    let toolbarOffsetX = 0;
    let toolbarOffsetY = 0;

    toolbar.addEventListener("mousedown", (e) => {
      if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".pdp-color-swatch")) return;
      isDraggingToolbar = true;
      const rect = toolbar.getBoundingClientRect();
      toolbarOffsetX = e.clientX - rect.left;
      toolbarOffsetY = e.clientY - rect.top;
      toolbar.style.transform = "none";
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDraggingToolbar) return;
      toolbar.style.left = `${e.clientX - toolbarOffsetX}px`;
      toolbar.style.top = `${e.clientY - toolbarOffsetY}px`;
    });

    window.addEventListener("mouseup", () => {
      isDraggingToolbar = false;
    });

    toolbar.innerHTML = `
      <div class="pdp-group">
        <button class="pdp-btn active" id="btn-pen" title="Pen Tool">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.5 7.5"/></svg>
        </button>
        <button class="pdp-btn" id="btn-select" title="Select & Move">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7 18 3-7 7-3L3 3z"/></svg>
        </button>
        <button class="pdp-btn" id="btn-erase" title="Eraser">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 20H7L3 16c-1.5-1.5-1.5-4 0-5.5l9-9c1.5-1.5 4-1.5 5.5 0l5 5c1.5 1.5 1.5 4 0 5.5L13 20"/><path d="M18 13l-5-5"/></svg>
        </button>
      </div>
      <div class="pdp-group" id="pdp-colors"></div>
      <div class="pdp-group">
        <input type="range" class="pdp-slider" id="pdp-size" min="1" max="25" value="3" title="Stroke Thickness">
      </div>
      <div class="pdp-group">
        <button class="pdp-btn" id="btn-undo" title="Undo">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>
        </button>
        <button class="pdp-btn" id="btn-redo" title="Redo">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 3.7"/></svg>
        </button>
        <button class="pdp-btn" id="btn-clear" title="Clear All">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </div>
      <div class="pdp-badge">PDP</div>
    `;

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(canvas);
    shadowRoot.appendChild(toolbar);
    document.body.appendChild(hostEl);

    renderColors();
    setupEvents();
    resizeCanvas();
  }

  function renderColors() {
    const container = shadowRoot.querySelector("#pdp-colors");
    container.innerHTML = "";
    colors.forEach((col, idx) => {
      const swatch = document.createElement("div");
      swatch.className = `pdp-color-swatch ${idx === activeColorIndex ? "active" : ""}`;
      swatch.style.backgroundColor = col;

      swatch.addEventListener("click", () => {
        activeColorIndex = idx;
        renderColors();
      });

      container.appendChild(swatch);
    });
  }

  function setupEvents() {
    const btnPen = shadowRoot.querySelector("#btn-pen");
    const btnSelect = shadowRoot.querySelector("#btn-select");
    const btnErase = shadowRoot.querySelector("#btn-erase");
    const sizeInput = shadowRoot.querySelector("#pdp-size");
    const btnUndo = shadowRoot.querySelector("#btn-undo");
    const btnRedo = shadowRoot.querySelector("#btn-redo");
    const btnClear = shadowRoot.querySelector("#btn-clear");

    function setTool(tool) {
      currentTool = tool;
      btnPen.classList.toggle("active", tool === "pen");
      btnSelect.classList.toggle("active", tool === "select");
      btnErase.classList.toggle("active", tool === "erase");
      if (tool !== "select") {
        selectedStrokeIds.clear();
        selectionBox = null;
        requestRedraw();
      }
    }

    btnPen.addEventListener("click", () => setTool("pen"));
    btnSelect.addEventListener("click", () => setTool("select"));
    btnErase.addEventListener("click", () => setTool("erase"));

    sizeInput.addEventListener("input", (e) => {
      strokeWidth = parseInt(e.target.value, 10);
    });

    btnUndo.addEventListener("click", undo);
    btnRedo.addEventListener("click", redo);
    btnClear.addEventListener("click", clearAll);

    window.addEventListener("resize", resizeCanvas);

    canvas.addEventListener("wheel", (e) => {
      window.scrollBy({
        top: e.deltaY,
        left: e.deltaX,
        behavior: "instant"
      });
    }, { passive: true });

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    window.addEventListener("keydown", (e) => {
      if (!active) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedStrokeIds.size > 0) {
          pushUndoState();
          strokes = strokes.filter((s) => !selectedStrokeIds.has(s.id));
          selectedStrokeIds.clear();
          selectionBox = null;
          requestRedraw();
        }
      }
    });
  }

  function resizeCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(dpr, dpr);
    requestRedraw();
  }

  function pushUndoState() {
    undoStack.push(JSON.parse(JSON.stringify(strokes)));
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.parse(JSON.stringify(strokes)));
    strokes = undoStack.pop();
    selectedStrokeIds.clear();
    selectionBox = null;
    requestRedraw();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.parse(JSON.stringify(strokes)));
    strokes = redoStack.pop();
    selectedStrokeIds.clear();
    selectionBox = null;
    requestRedraw();
  }

  function clearAll() {
    if (strokes.length === 0) return;
    pushUndoState();
    strokes = [];
    selectedStrokeIds.clear();
    selectionBox = null;
    requestRedraw();
  }

  function onMouseDown(e) {
    if (!active) return;
    const pt = { x: e.clientX, y: e.clientY };

    if (currentTool === "pen") {
      pushUndoState();
      currentStroke = {
        id: Date.now() + Math.random(),
        type: "path",
        points: [pt],
        color: colors[activeColorIndex],
        size: strokeWidth
      };
    } else if (currentTool === "erase") {
      pushUndoState();
      eraseAtPoint(pt);
      currentStroke = { type: "erase", points: [pt] };
    } else if (currentTool === "select") {
      if (selectedStrokeIds.size > 0 && isPointInSelectedBounds(pt)) {
        isDraggingSelection = true;
        dragStartPos = pt;
        pushUndoState();
      } else {
        selectedStrokeIds.clear();
        selectionBox = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
      }
    }
  }

  function onMouseMove(e) {
    if (!active) return;
    const pt = { x: e.clientX, y: e.clientY };

    if (currentTool === "pen" && currentStroke) {
      currentStroke.points.push(pt);
      requestRedraw();
    } else if (currentTool === "erase" && currentStroke) {
      currentStroke.points.push(pt);
      eraseAtPoint(pt);
      requestRedraw();
    } else if (currentTool === "select") {
      if (isDraggingSelection && dragStartPos) {
        const dx = pt.x - dragStartPos.x;
        const dy = pt.y - dragStartPos.y;
        dragStartPos = pt;

        strokes.forEach((s) => {
          if (selectedStrokeIds.has(s.id)) {
            s.points.forEach((p) => {
              p.x += dx;
              p.y += dy;
            });
          }
        });
        requestRedraw();
      } else if (selectionBox) {
        selectionBox.x2 = pt.x;
        selectionBox.y2 = pt.y;
        updateSelectionFromBox();
        requestRedraw();
      }
    }
  }

  function onMouseUp() {
    if (!active) return;
    if (currentTool === "pen" && currentStroke) {
      strokes.push(currentStroke);
      currentStroke = null;
    } else if (currentTool === "erase" && currentStroke) {
      currentStroke = null;
    } else if (currentTool === "select") {
      isDraggingSelection = false;
      dragStartPos = null;
      selectionBox = null;
    }
    requestRedraw();
  }

  function eraseAtPoint(pt) {
    const radius = strokeWidth * 3;
    strokes = strokes.filter((s) => {
      return !s.points.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < radius);
    });
  }

  function updateSelectionFromBox() {
    if (!selectionBox) return;
    const minX = Math.min(selectionBox.x1, selectionBox.x2);
    const maxX = Math.max(selectionBox.x1, selectionBox.x2);
    const minY = Math.min(selectionBox.y1, selectionBox.y2);
    const maxY = Math.max(selectionBox.y1, selectionBox.y2);

    selectedStrokeIds.clear();
    strokes.forEach((s) => {
      const isInside = s.points.some(
        (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
      );
      if (isInside) selectedStrokeIds.add(s.id);
    });
  }

  function getSelectedBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    strokes.forEach((s) => {
      if (selectedStrokeIds.has(s.id)) {
        s.points.forEach((p) => {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        });
      }
    });
    if (minX === Infinity) return null;
    return { minX: minX - 6, minY: minY - 6, maxX: maxX + 6, maxY: maxY + 6 };
  }

  function isPointInSelectedBounds(pt) {
    const b = getSelectedBounds();
    if (!b) return false;
    return pt.x >= b.minX && pt.x <= b.maxX && pt.y >= b.minY && pt.y <= b.maxY;
  }

  function requestRedraw() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
      redraw();
      renderPending = false;
    });
  }

  function redraw() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    strokes.forEach((s) => drawStroke(s));

    if (currentStroke && currentTool === "pen") {
      drawStroke(currentStroke);
    }

    if (selectedStrokeIds.size > 0) {
      const b = getSelectedBounds();
      if (b) {
        ctx.save();
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
        ctx.restore();
      }
    }

    if (selectionBox && currentTool === "select" && !isDraggingSelection) {
      const x = Math.min(selectionBox.x1, selectionBox.x2);
      const y = Math.min(selectionBox.y1, selectionBox.y2);
      const w = Math.abs(selectionBox.x2 - selectionBox.x1);
      const h = Math.abs(selectionBox.y2 - selectionBox.y1);

      ctx.save();
      ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
      ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
  }

  function drawStroke(s) {
    if (!s.points || s.points.length === 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x, s.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function toggle() {
    active = !active;
    if (!hostEl) initUI();
    hostEl.style.display = active ? "block" : "none";
    canvas.style.pointerEvents = active ? "auto" : "none";
    if (active) resizeCanvas();
  }

  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === "toggle-pdp") toggle();
  });
})();