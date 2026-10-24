"use strict";

/* ------------------------------------------------------------------ helpers */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const SVG_NS = "http://www.w3.org/2000/svg";

const ICONS = {
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  contrast: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  users: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  shuffle: '<path d="M4 7h2.5c4.5 0 6.5 10 11 10H20"/><path d="M4 17h2.5c4.5 0 6.5-10 11-10H20"/><path d="m17.5 4.5 2.5 2.5-2.5 2.5"/><path d="m17.5 14.5 2.5 2.5-2.5 2.5"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v3.7h3.7"/>',
  check: '<circle cx="12" cy="12" r="8"/><path d="m8.6 12.2 2.3 2.3 4.5-4.8"/>',
  cross: '<circle cx="12" cy="12" r="8"/><path d="m9.5 9.5 5 5m0-5-5 5"/>',
  table: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M10 10v9"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/><path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
  wrench: '<path d="M14.6 6.3a4 4 0 0 0-5 5.2l-5 5a1.5 1.5 0 0 0 2.1 2.1l5-5a4 4 0 0 0 5.2-5l-2.3 2.3-2.2-.3-.3-2.2z"/>',
  chart: '<path d="M4 20h16"/><path d="M7 16v-5"/><path d="M12 16V7"/><path d="M17 16v-3"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  eraser: '<path d="M8 20 4.2 16.2a1.8 1.8 0 0 1 0-2.5L13.5 4.4a1.8 1.8 0 0 1 2.5 0l3.6 3.6a1.8 1.8 0 0 1 0 2.5L10 20"/><path d="M8 20h12"/><path d="m9 9 6 6"/>',
};

function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

function hydrateIcons(root = document) {
  for (const node of $$("[data-icon]", root)) {
    if (!node.firstElementChild) node.innerHTML = icon(node.dataset.icon);
  }
}

function svg(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

const pct = (x, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const fmt3 = (x) => x.toFixed(3);

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

/* Bar with a 4px rounded data end and a square baseline end. */
function hBarPath(x0, x1, y, h) {
  const w = x1 - x0;
  if (w <= 0) return "";
  const r = Math.min(4, w, h / 2);
  return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`;
}
function vBarPath(x, w, yTop, yBase) {
  const h = yBase - yTop;
  if (h <= 0) return "";
  const r = Math.min(4, h, w / 2);
  return `M${x},${yBase}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yBase}Z`;
}

function niceTicks(max, count = 4) {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

/* ------------------------------------------------------------------ tooltip */

const tooltip = $("#tooltip");

function showTip(html, event) {
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  const pad = 14;
  const { innerWidth: vw, innerHeight: vh } = window;
  const rect = tooltip.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + rect.width > vw - 8) x = event.clientX - rect.width - pad;
  if (y + rect.height > vh - 8) y = event.clientY - rect.height - pad;
  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${Math.max(8, y)}px`;
}
function hideTip() {
  tooltip.hidden = true;
}

document.addEventListener("mouseover", (e) => {
  const target = e.target.closest("[data-tip]");
  if (target) showTip(escapeHtml(target.dataset.tip), e);
});
document.addEventListener("mousemove", (e) => {
  const target = e.target.closest("[data-tip]");
  if (target) showTip(escapeHtml(target.dataset.tip), e);
});
document.addEventListener("mouseout", (e) => {
  if (e.target.closest("[data-tip]") && !e.relatedTarget?.closest?.("[data-tip]")) hideTip();
});
document.addEventListener("focusin", (e) => {
  const target = e.target.closest(".info[data-tip]");
  if (!target) return;
  const box = target.getBoundingClientRect();
  showTip(escapeHtml(target.dataset.tip), { clientX: box.left, clientY: box.bottom });
});
document.addEventListener("focusout", (e) => {
  if (e.target.closest(".info[data-tip]")) hideTip();
});

/* ------------------------------------------------------------------ state */

const state = {
  meta: null,
  values: {},
  unknown: new Set(), // fields the user does not know; their last value is kept for when they return
  demo: null, // { id, outcome, edited }
  lastProb: 0,
  requestSeq: 0,
  exploreFeature: "age",
  exploreData: null,
};

const OUTCOME = { 0: "No heart disease", 1: "Heart disease" };
const BAND_TEXT = { low: "Low risk", moderate: "Moderate risk", high: "High risk" };

/* ------------------------------------------------------------------ form */

function useSegmented(spec) {
  return spec.options.length <= 4 && spec.options.reduce((n, o) => n + o.label.length, 0) <= 20;
}

function fieldLabel(spec, id, tag = "label") {
  const forAttr = tag === "label" ? ` for="${id}"` : ` id="${id}-label"`;
  const info = spec.help
    ? `<button type="button" class="info" data-tip="${escapeHtml(spec.help)}" aria-label="${escapeHtml(spec.help)}">${icon("info")}</button>`
    : "";
  const unit = spec.unit ? `<span class="field-unit">${escapeHtml(spec.unit)}</span>` : "";
  return `<${tag} class="field-label"${forAttr}><span class="label-text">${escapeHtml(spec.label)}</span>${info}${unit}</${tag}>`;
}

function buildField(spec) {
  const field = document.createElement("div");
  field.className = "field";
  const id = `f-${spec.name}`;

  if (spec.kind === "number") {
    field.innerHTML = `
      ${fieldLabel(spec, id)}
      <div class="num-row">
        <input type="range" id="${id}-range" min="${spec.min}" max="${spec.max}" step="${spec.step}"
               aria-label="${escapeHtml(spec.label)} slider">
        <input type="number" class="num-input" id="${id}" min="${spec.min}" max="${spec.max}" step="${spec.step}" inputmode="decimal" placeholder="?">
      </div>`;
    const range = $(`#${id}-range`, field);
    const number = $(`#${id}`, field);
    range.addEventListener("input", () => setValue(spec.name, Number(range.value), "user"));
    number.addEventListener("input", () => {
      if (number.value === "") return setUnknown(spec.name);
      const v = Number(number.value);
      if (v >= spec.min && v <= spec.max) setValue(spec.name, v, "user", number);
    });
    number.addEventListener("change", () => {
      if (number.value === "") return;
      const v = Math.min(spec.max, Math.max(spec.min, Number(number.value)));
      setValue(spec.name, v, "user");
    });
  } else if (useSegmented(spec)) {
    field.innerHTML = `
      ${fieldLabel(spec, id, "span")}
      <div class="segmented" role="radiogroup" aria-labelledby="${id}-label">
        ${spec.options.map((o) => `<button type="button" role="radio" data-value="${o.value}" aria-checked="false">${escapeHtml(o.label)}</button>`).join("")}
        <button type="button" role="radio" data-value="" aria-checked="false" aria-label="Unknown" data-tip="Unknown">?</button>
      </div>`;
    const group = $(".segmented", field);
    group.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.dataset.value === "") setUnknown(spec.name);
      else setValue(spec.name, Number(btn.dataset.value), "user");
    });
    group.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      const values = spec.options.map((o) => o.value);
      const i = values.indexOf(state.values[spec.name]);
      const next = values[(i + (e.key === "ArrowRight" ? 1 : values.length - 1)) % values.length];
      setValue(spec.name, next, "user");
      $(`button[data-value="${next}"]`, group).focus();
    });
  } else {
    field.innerHTML = `
      ${fieldLabel(spec, id)}
      <select class="select" id="${id}">
        <option value="">Unknown</option>
        ${spec.options.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join("")}
      </select>`;
    $("select", field).addEventListener("change", (e) => {
      if (e.target.value === "") setUnknown(spec.name);
      else setValue(spec.name, Number(e.target.value), "user");
    });
  }
  return field;
}

function buildForm() {
  const form = $("#patient-form");
  form.addEventListener("submit", (e) => e.preventDefault());
  for (const group of state.meta.groups) {
    const section = document.createElement("div");
    section.className = "group";
    section.innerHTML = `<p class="group-title">${escapeHtml(group.title)}</p>`;
    const grid = document.createElement("div");
    grid.className = "fields";
    for (const name of group.fields) grid.append(buildField(state.meta.fields[name]));
    section.append(grid);
    form.append(section);
  }
}

function syncControl(name, skip) {
  const spec = state.meta.fields[name];
  const value = state.values[name];
  const unknown = state.unknown.has(name);
  const id = `f-${name}`;
  $(`#${id}`)?.closest(".field")?.classList.toggle("is-unknown", unknown);
  $(`#${id}-label`)?.closest(".field")?.classList.toggle("is-unknown", unknown);
  if (spec.kind === "number") {
    const range = $(`#${id}-range`);
    const number = $(`#${id}`);
    range.value = value;
    range.style.setProperty("--fill", `${((value - spec.min) / (spec.max - spec.min)) * 100}%`);
    if (number !== skip) number.value = unknown ? "" : value;
  } else if (useSegmented(spec)) {
    for (const btn of $$(`#${id}-label + .segmented button`)) {
      const on = unknown ? btn.dataset.value === "" : btn.dataset.value !== "" && Number(btn.dataset.value) === value;
      btn.setAttribute("aria-checked", String(on));
      btn.tabIndex = on ? 0 : -1;
    }
  } else {
    $(`#${id}`).value = unknown ? "" : value;
  }
}

function setValue(name, value, source, skip) {
  state.values[name] = value;
  state.unknown.delete(name);
  syncControl(name, skip);
  if (source === "user" && state.demo) state.demo.edited = true;
  if (source !== "bulk") schedulePredict();
}

function setPatient(patient) {
  for (const [name, value] of Object.entries(patient)) setValue(name, value, "bulk");
  schedulePredict();
}

/* Marking a value unknown keeps a demo patient's comparison valid: it is still the same
   real patient, just with less information. */
function setUnknown(name, bulk = false) {
  state.unknown.add(name);
  syncControl(name);
  if (!bulk) schedulePredict();
}

function clearAll() {
  state.demo = null;
  for (const name of Object.keys(state.meta.fields)) setUnknown(name, true);
  schedulePredict();
}

function knownValues() {
  return Object.fromEntries(Object.entries(state.values).filter(([name]) => !state.unknown.has(name)));
}

function typicalPatient() {
  return Object.fromEntries(Object.entries(state.meta.fields).map(([k, spec]) => [k, spec.default]));
}

/* ------------------------------------------------------------------ prediction */

const schedulePredict = debounce(runPredict, 120);

async function runPredict() {
  const seq = ++state.requestSeq;
  try {
    const result = await api("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(knownValues()),
    });
    if (seq === state.requestSeq) renderResult(result);
  } catch (err) {
    if (seq === state.requestSeq) {
      $("#band-text").textContent = "Could not reach the model. Is server.py running?";
    }
  }
}

function tweenNumber(node, from, to, ms = 300) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const show = (v) => { node.textContent = v < 1 && to > 0 ? "<1" : Math.round(v); };
  if (reduce) return show(to);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - (1 - t) ** 3;
    show(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderResult(r) {
  const p = r.probability * 100;
  tweenNumber($("#prob"), state.lastProb, p);
  state.lastProb = p;

  $("#marker").style.left = `${p}%`;
  $("#band").dataset.band = r.band;
  $("#band-text").textContent = BAND_TEXT[r.band];
  $("#mini-prob").textContent = p < 1 ? "<1" : Math.round(p);
  $("#mini-band").textContent = r.unknown.length
    ? `(${Math.round(r.low * 100)} to ${Math.round(r.high * 100)}%)`
    : BAND_TEXT[r.band].toLowerCase();
  renderUncertainty(r);

  renderDemoResult(r);
  renderDrivers(r.drivers);
}

function renderUncertainty(r) {
  const n = r.unknown.length;
  const total = Object.keys(state.meta.fields).length;
  const rangeBox = $("#scale-range");
  const rangeText = $("#range-text");
  const verdict = $("#verdict");

  if (!n) {
    rangeBox.hidden = true;
    rangeText.hidden = true;
    verdict.textContent = r.prediction
      ? "At or above the 50% threshold, so the model classifies this patient as having heart disease."
      : "Below the 50% threshold, so the model classifies this patient as free of heart disease.";
    return;
  }

  const low = Math.round(r.low * 100);
  const high = Math.round(r.high * 100);
  rangeBox.hidden = false;
  rangeBox.style.left = `${r.low * 100}%`;
  rangeBox.style.width = `${Math.max(0.5, (r.high - r.low) * 100)}%`;
  rangeText.hidden = false;
  const helpful = r.unknown.slice(0, 2).map((u) => u.label.toLowerCase());
  rangeText.innerHTML = `Likely between <strong>${low}%</strong> and <strong>${high}%</strong>, because ${n} of ${total} values ${n === 1 ? "is" : "are"} unknown.` +
    (n < total ? ` Adding ${helpful.join(" and ")} would narrow this most.` : "");

  if (n === total) {
    verdict.textContent = "Nothing entered yet, so this is the average across patients in the study. Enter what you know to personalise it.";
  } else if (r.low < 0.5 && r.high >= 0.5) {
    verdict.textContent = "Depending on the unknown values, this patient could fall on either side of the 50% threshold.";
  } else {
    verdict.textContent = r.prediction
      ? "Above the 50% threshold even allowing for the unknown values, so the model classifies this patient as having heart disease."
      : "Below the 50% threshold even allowing for the unknown values, so the model classifies this patient as free of heart disease.";
  }
}

function renderDemoResult(r) {
  const box = $("#demo-result");
  const demo = state.demo;
  if (!demo) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (demo.edited) {
    box.innerHTML = `<p class="muted">You changed patient #${demo.id}'s values, so the recorded outcome no longer applies. Load another real patient to compare again.</p>`;
    return;
  }
  const agree = r.prediction === demo.outcome;
  box.innerHTML = `
    <p class="muted">Patient #${demo.id} from the held-out test set</p>
    <p class="row">Recorded outcome: ${OUTCOME[demo.outcome]}</p>
    <p class="row ${agree ? "agree" : "disagree"}">${icon(agree ? "check" : "cross")}
      ${agree ? "The model agrees with the recorded outcome." : "The model gets this patient wrong."}</p>
    ${agree ? "" : `<p class="muted">This happens for about ${Math.round((1 - state.meta.metrics.accuracy) * 100)}% of test patients.</p>`}`;
}

function renderDrivers(drivers) {
  const list = $("#drivers");
  if (!drivers.length) {
    const nothingKnown = state.unknown.size === Object.keys(state.meta.fields).length;
    list.innerHTML = nothingKnown
      ? `<li class="driver-empty">Enter a value to see how it moves the estimate.</li>`
      : `<li class="driver-empty">None of the known values moves the estimate much on its own.</li>`;
    return;
  }
  const scale = Math.max(0.05, ...drivers.map((d) => Math.abs(d.effect)));
  list.innerHTML = drivers
    .map((d) => {
      const width = (Math.abs(d.effect) / scale) * 50;
      const pts = Math.round(d.effect * 100);
      const sign = pts > 0 ? "+" : pts < 0 ? "\u2212" : "";
      const tip = `Knowing ${d.label.toLowerCase()} is ${d.value} moves the estimate ${d.effect > 0 ? "up" : "down"} ${Math.abs(pts)} points.`;
      return `
        <li class="driver" data-tip="${escapeHtml(tip)}">
          <span class="driver-name">${escapeHtml(d.label)} <span class="driver-val">${escapeHtml(d.value)}</span></span>
          <span class="driver-bar"><span class="driver-fill ${d.effect > 0 ? "up" : "down"}" style="width:${width}%"></span></span>
          <span class="driver-num">${sign}${Math.abs(pts)}</span>
        </li>`;
    })
    .join("");
}

/* On small screens the result panel sits below the form, so a pinned bar shows the
   estimate while the form is on screen and the full panel is not. */
function watchMiniResult() {
  const mini = $("#mini-result");
  const visible = { form: false, result: false };
  const update = () => { mini.hidden = !(visible.form && !visible.result); };
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) visible[e.target === $(".result") ? "result" : "form"] = e.isIntersecting;
    update();
  });
  observer.observe($(".assess-form"));
  observer.observe($(".result"));
}

/* ------------------------------------------------------------------ real demo */

async function loadDemo(outcome) {
  const params = new URLSearchParams();
  if (outcome !== "") params.set("outcome", outcome);
  if (state.demo) params.set("exclude", state.demo.id);
  const buttons = $$("[data-demo]");
  buttons.forEach((b) => (b.disabled = true));
  try {
    const d = await api(`/api/demo-patient?${params}`);
    state.demo = { id: d.id, outcome: d.outcome, edited: false };
    setPatient(d.patient);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

/* ------------------------------------------------------------------ model section */

function renderModelSection() {
  const m = state.meta;
  const t = m.metrics;
  const name = m.model_name.toLowerCase();

  $("#demo-pool").textContent = m.n_test;
  $("#lede").innerHTML = `A ${escapeHtml(name)} trained on ${m.n_train} patients and tested on ${m.n_test} it never saw. It classifies <strong>${pct(t.accuracy)}</strong> of those test patients correctly.`;
  $("#hero-accuracy").textContent = pct(t.accuracy);
  $("#hero-caption").textContent = `of the ${m.n_test} held-out patients classified correctly`;
  $("#model-sub").textContent = `Every figure below comes from the ${m.n_test} test patients the ${name} never trained on.`;
  $("#footer-model").textContent = `${m.model_name}, ${m.n_patients} patients, ROC-AUC ${fmt3(t.roc_auc)}`;

  const items = [
    ["Recall", pct(t.recall), "of patients with heart disease are flagged"],
    ["Precision", pct(t.precision), "of flagged patients truly have it"],
    ["F1 score", pct(t.f1), "balance of recall and precision"],
    ["ROC-AUC", fmt3(t.roc_auc), "chance a sick patient ranks above a healthy one"],
  ];
  $("#metric-list").innerHTML = items
    .map(([k, v, note]) => `<div><dt>${k}</dt><dd>${v}</dd><p class="note">${note}</p></div>`)
    .join("");

  renderConfusion(t.confusion_matrix);
  renderComparison();
  renderImportanceTable();
}

function luminance(color) {
  const probe = document.createElement("span");
  probe.style.color = color;
  document.body.append(probe);
  const [r, g, b] = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g).map(Number);
  probe.remove();
  const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function renderConfusion(cm) {
  const [[tn, fp], [fn, tp]] = cm;
  const max = Math.max(tn, fp, fn, tp);
  const step = (n) => `var(--seq-${Math.min(4, 1 + Math.floor((n / max) * 3.999))})`;
  const cell = (n, title, desc) => {
    const bg = step(n);
    const tone = luminance(bg) > 0.3 ? "light" : "dark";
    return `<div class="cm-cell ${tone}" style="background:${bg}">
      <span class="cm-count">${n}</span>
      <span><span class="cm-name">${title}</span><br><span class="cm-desc">${desc}</span></span>
    </div>`;
  };
  $("#confusion").innerHTML = `
    <div class="cm">
      <span></span>
      <span class="cm-axis col">Predicted no disease</span>
      <span class="cm-axis col">Predicted disease</span>
      <span class="cm-axis row">No disease</span>
      ${cell(tn, "Correctly cleared", "healthy, predicted healthy")}
      ${cell(fp, "False alarm", "healthy, flagged as sick")}
      <span class="cm-axis row">Disease</span>
      ${cell(fn, "Missed", "sick, predicted healthy")}
      ${cell(tp, "Correctly flagged", "sick, flagged as sick")}
    </div>
    <p class="cm-note">Rows are the recorded outcome. ${fn} of ${fn + tp} patients with heart disease were missed, and ${fp} of ${tn + fp} healthy patients were flagged.</p>`;
}

function renderRoc() {
  const host = $("#roc");
  const { fpr, tpr } = state.meta.metrics.roc_curve;
  const W = Math.max(280, host.clientWidth);
  const H = Math.min(340, Math.round(W * 0.72));
  const m = { l: 44, r: 12, t: 10, b: 40 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const x = (v) => m.l + v * iw;
  const y = (v) => m.t + (1 - v) * ih;

  host.innerHTML = "";
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `ROC curve, area under curve ${fmt3(state.meta.metrics.roc_auc)}` }, host);
  const grid = svg("g", { class: "grid" }, root);
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    svg("line", { x1: x(0), x2: x(1), y1: y(v), y2: y(v) }, grid);
    svg("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, root).textContent = `${v * 100}%`;
    svg("text", { x: x(v), y: H - m.b + 18, "text-anchor": "middle" }, root).textContent = `${v * 100}%`;
  }
  svg("text", { x: m.l + iw / 2, y: H - 4, "text-anchor": "middle", class: "label-mid" }, root).textContent = "False positive rate";
  const yl = svg("text", { x: 12, y: m.t + ih / 2, "text-anchor": "middle", class: "label-mid", transform: `rotate(-90 12 ${m.t + ih / 2})` }, root);
  yl.textContent = "True positive rate";

  svg("line", { x1: x(0), y1: y(0), x2: x(1), y2: y(1), style: "stroke:var(--line-2);stroke-width:1.5" }, root);
  svg("text", { x: x(0.62), y: y(0.55), class: "label-mid", transform: `rotate(${(-Math.atan2(ih, iw) * 180) / Math.PI} ${x(0.62)} ${y(0.55)})` }, root).textContent = "Random guessing";

  const pts = fpr.map((f, i) => `${x(f)},${y(tpr[i])}`);
  svg("path", { d: `M${x(0)},${y(0)}L${pts.join("L")}L${x(1)},${y(0)}Z`, style: "fill:var(--red-wash)" }, root);
  svg("path", { d: `M${pts.join("L")}`, style: "fill:none;stroke:var(--red);stroke-width:2;stroke-linejoin:round;stroke-linecap:round" }, root);
  svg("text", { x: x(0.3), y: y(0.86), class: "label-strong" }, root).textContent = `Area under curve ${fmt3(state.meta.metrics.roc_auc)}`;

  const guide = svg("line", { y1: y(0), y2: y(1), style: "stroke:var(--ink-3);stroke-width:1", visibility: "hidden" }, root);
  const dot = svg("circle", { r: 5, style: "fill:var(--red);stroke:var(--surface);stroke-width:2", visibility: "hidden" }, root);
  const hit = svg("rect", { x: m.l, y: m.t, width: iw, height: ih, class: "hit" }, root);

  hit.addEventListener("mousemove", (e) => {
    const box = root.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, ((e.clientX - box.left) * (W / box.width) - m.l) / iw));
    let best = 0;
    for (let i = 0; i < fpr.length; i++) if (Math.abs(fpr[i] - fx) <= Math.abs(fpr[best] - fx)) best = i;
    guide.setAttribute("x1", x(fpr[best]));
    guide.setAttribute("x2", x(fpr[best]));
    dot.setAttribute("cx", x(fpr[best]));
    dot.setAttribute("cy", y(tpr[best]));
    guide.setAttribute("visibility", "visible");
    dot.setAttribute("visibility", "visible");
    showTip(`Catches <strong>${pct(tpr[best], 0)}</strong> of sick patients<br>while flagging <strong>${pct(fpr[best], 0)}</strong> of healthy ones`, e);
  });
  hit.addEventListener("mouseleave", () => {
    guide.setAttribute("visibility", "hidden");
    dot.setAttribute("visibility", "hidden");
    hideTip();
  });
}

function renderComparison() {
  const m = state.meta;
  const rows = [...m.comparison].sort((a, b) => b.cv_roc_auc - a.cv_roc_auc);
  const params = (p) => Object.entries(p).map(([k, v]) => `${k}=${v === null ? "none" : v}`).join(", ");
  $("#comparison").innerHTML = `
    <thead><tr>
      <th>Model</th><th class="num">CV ROC-AUC</th><th class="num">Test ROC-AUC</th>
      <th class="num">Test accuracy</th><th class="num">Test recall</th><th>Best settings</th>
    </tr></thead>
    <tbody>${rows.map((r) => `
      <tr class="${r.model === m.model_name ? "selected" : ""}">
        <td>${escapeHtml(r.model)}${r.model === m.model_name ? '<span class="pill">Deployed</span>' : ""}</td>
        <td class="num">${fmt3(r.cv_roc_auc)} <span class="params">± ${fmt3(r.cv_roc_auc_std)}</span></td>
        <td class="num">${fmt3(r.test_roc_auc)}</td>
        <td class="num">${pct(r.test_accuracy)}</td>
        <td class="num">${pct(r.test_recall)}</td>
        <td class="params">${escapeHtml(params(r.best_params))}</td>
      </tr>`).join("")}
    </tbody>`;
}

function renderImportance() {
  const host = $("#importance");
  const rows = state.meta.importance;
  const W = Math.max(300, host.clientWidth);
  const narrow = W < 520;
  const labelW = narrow ? 128 : 200;
  const rowH = 30;
  const barH = 14;
  const m = { l: labelW, r: 56, t: 4, b: 30 };
  const H = m.t + m.b + rows.length * rowH;
  const iw = W - m.l - m.r;
  const max = Math.max(...rows.map((r) => r.mean));
  const ticks = niceTicks(max, narrow ? 3 : 4);
  const top = ticks[ticks.length - 1];
  const x = (v) => m.l + (Math.max(0, v) / top) * iw;

  host.innerHTML = "";
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Permutation feature importance" }, host);
  const grid = svg("g", { class: "grid" }, root);
  for (const t of ticks) {
    svg("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b }, grid);
    svg("text", { x: x(t), y: H - m.b + 18, "text-anchor": "middle" }, root).textContent = t.toFixed(2);
  }
  const bars = svg("g", {}, root);
  rows.forEach((r, i) => {
    const yMid = m.t + i * rowH + rowH / 2;
    const label = svg("text", { x: m.l - 10, y: yMid + 4, "text-anchor": "end", class: "label-mid" }, root);
    label.textContent = narrow && r.label.length > 18 ? `${r.label.slice(0, 17)}…` : r.label;
    const g = svg("g", { class: "bar-hover" }, bars);
    svg("path", { d: hBarPath(x(0), x(r.mean), yMid - barH / 2, barH), style: "fill:var(--blue)" }, g);
    svg("text", { x: x(r.mean) + 6, y: yMid + 4, class: "label-mid" }, g).textContent = r.mean.toFixed(3);
    const hit = svg("rect", { x: 0, y: yMid - rowH / 2, width: W, height: rowH, class: "hit" }, g);
    hit.addEventListener("mousemove", (e) => {
      root.classList.add("dim");
      g.classList.add("active");
      showTip(`<strong>${escapeHtml(r.label)}</strong><br>ROC-AUC drop ${r.mean.toFixed(3)} ± ${r.std.toFixed(3)}`, e);
    });
    hit.addEventListener("mouseleave", () => {
      root.classList.remove("dim");
      g.classList.remove("active");
      hideTip();
    });
  });
  svg("line", { x1: x(0), x2: x(0), y1: m.t, y2: H - m.b, class: "baseline" }, root);
}

function renderImportanceTable() {
  $("#importance-table").innerHTML = `
    <thead><tr><th>Measurement</th><th class="num">ROC-AUC drop</th><th class="num">Std. dev.</th></tr></thead>
    <tbody>${state.meta.importance.map((r) => `
      <tr><td>${escapeHtml(r.label)}</td><td class="num">${r.mean.toFixed(3)}</td><td class="num">${r.std.toFixed(3)}</td></tr>`).join("")}
    </tbody>`;
}

/* ------------------------------------------------------------------ data explorer */

function buildFeaturePicker() {
  const picker = $("#feature-picker");
  const order = ["age", "sex", "cp", "trestbps", "chol", "fbs", "restecg", "thalach", "exang", "oldpeak", "slope", "ca", "thal"];
  picker.innerHTML = order
    .map((f) => `<button type="button" class="chip" role="tab" data-feature="${f}" aria-selected="${f === state.exploreFeature}">${escapeHtml(state.meta.fields[f].label)}</button>`)
    .join("");
  picker.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    for (const c of $$(".chip", picker)) c.setAttribute("aria-selected", String(c === chip));
    loadExplore(chip.dataset.feature);
  });
}

async function loadExplore(feature) {
  state.exploreFeature = feature;
  state.exploreData = await api(`/api/explore/${feature}`);
  renderExplore();
}

function renderExplore() {
  const d = state.exploreData;
  if (!d) return;
  $("#explore-title").textContent = d.label;
  hideTip();
  if (d.kind === "histogram") renderHistogram(d);
  else renderRates(d);
}

function renderHistogram(d) {
  $("#explore-sub").textContent = `Number of patients in each ${d.label.toLowerCase()} range, split by recorded outcome.`;
  $("#explore-legend").innerHTML = `
    <span class="key"><span class="swatch swatch-red"></span>Heart disease</span>
    <span class="key"><span class="swatch swatch-blue"></span>No heart disease</span>`;

  const host = $("#explore");
  const W = Math.max(300, host.clientWidth);
  const H = W < 520 ? 240 : 300;
  const m = { l: 38, r: 8, t: 10, b: 38 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const bins = d.edges.length - 1;
  const disease = d.series["1"];
  const healthy = d.series["0"];
  const ticks = niceTicks(Math.max(...disease, ...healthy), 4);
  const top = ticks[ticks.length - 1];
  const y = (v) => m.t + (1 - v / top) * ih;
  const bw = iw / bins;
  const barW = Math.min(12, Math.max(2, (bw - 6) / 2));
  const decimals = d.edges.some((e) => Math.abs(e - Math.round(e)) > 0.01) ? 1 : 0;
  const edge = (v) => v.toFixed(decimals);

  host.innerHTML = "";
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Histogram of ${d.label} by outcome` }, host);
  const grid = svg("g", { class: "grid" }, root);
  for (const t of ticks) {
    svg("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }, grid);
    svg("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, root).textContent = t;
  }
  const every = Math.ceil(bins / (W < 520 ? 4 : 7));
  for (let i = 0; i <= bins; i += every) {
    svg("text", { x: m.l + i * bw, y: H - m.b + 18, "text-anchor": "middle" }, root).textContent = edge(d.edges[i]);
  }
  svg("text", { x: m.l + iw / 2, y: H - 2, "text-anchor": "middle", class: "label-mid" }, root).textContent = d.unit ? `${d.label} (${d.unit})` : d.label;

  const bars = svg("g", {}, root);
  for (let i = 0; i < bins; i++) {
    const cx = m.l + i * bw + bw / 2;
    const g = svg("g", { class: "bar-hover" }, bars);
    svg("path", { d: vBarPath(cx - barW - 1, barW, y(disease[i]), y(0)), style: "fill:var(--red)" }, g);
    svg("path", { d: vBarPath(cx + 1, barW, y(healthy[i]), y(0)), style: "fill:var(--blue)" }, g);
    const hit = svg("rect", { x: m.l + i * bw, y: m.t, width: bw, height: ih, class: "hit" }, g);
    hit.addEventListener("mousemove", (e) => {
      root.classList.add("dim");
      g.classList.add("active");
      const total = disease[i] + healthy[i];
      const rate = total ? ` (${Math.round((disease[i] / total) * 100)}% with disease)` : "";
      showTip(`<strong>${edge(d.edges[i])} to ${edge(d.edges[i + 1])}${d.unit ? ` ${escapeHtml(d.unit)}` : ""}</strong><br>Heart disease: ${disease[i]}<br>No heart disease: ${healthy[i]}${rate}`, e);
    });
    hit.addEventListener("mouseleave", () => {
      root.classList.remove("dim");
      g.classList.remove("active");
      hideTip();
    });
  }
  svg("line", { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: "baseline" }, root);

  $("#explore-table").innerHTML = `
    <thead><tr><th>Range</th><th class="num">Heart disease</th><th class="num">No heart disease</th></tr></thead>
    <tbody>${disease.map((n, i) => `
      <tr><td>${edge(d.edges[i])} to ${edge(d.edges[i + 1])}</td><td class="num">${n}</td><td class="num">${healthy[i]}</td></tr>`).join("")}
    </tbody>`;
}

function renderRates(d) {
  $("#explore-sub").textContent = "Share of patients in each group who have heart disease. The vertical line marks the rate across all patients.";
  $("#explore-legend").innerHTML = "";

  const host = $("#explore");
  const W = Math.max(300, host.clientWidth);
  const narrow = W < 520;
  const labelW = narrow ? 130 : 220;
  const rowH = 46;
  const barH = 18;
  const m = { l: labelW, r: 52, t: 24, b: 30 };
  const H = m.t + m.b + d.groups.length * rowH;
  const iw = W - m.l - m.r;
  const x = (v) => m.l + v * iw;

  host.innerHTML = "";
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Heart disease rate by ${d.label}` }, host);
  const grid = svg("g", { class: "grid" }, root);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    svg("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b }, grid);
    svg("text", { x: x(t), y: H - m.b + 18, "text-anchor": "middle" }, root).textContent = `${t * 100}%`;
  }
  const bars = svg("g", {}, root);
  d.groups.forEach((gr, i) => {
    const yMid = m.t + i * rowH + rowH / 2;
    svg("text", { x: m.l - 12, y: yMid - 2, "text-anchor": "end", class: "label-strong" }, root).textContent =
      narrow && gr.label.length > 17 ? `${gr.label.slice(0, 16)}…` : gr.label;
    svg("text", { x: m.l - 12, y: yMid + 13, "text-anchor": "end" }, root).textContent = `${gr.n} patients`;
    const g = svg("g", { class: "bar-hover" }, bars);
    svg("path", { d: hBarPath(x(0), x(gr.rate), yMid - barH / 2, barH), style: "fill:var(--red)" }, g);
    svg("text", { x: x(gr.rate) + 6, y: yMid + 4, class: "label-mid" }, g).textContent = `${Math.round(gr.rate * 100)}%`;
    const hit = svg("rect", { x: 0, y: yMid - rowH / 2, width: W, height: rowH, class: "hit" }, g);
    hit.addEventListener("mousemove", (e) => {
      root.classList.add("dim");
      g.classList.add("active");
      showTip(`<strong>${escapeHtml(gr.label)}</strong><br>${gr.disease} of ${gr.n} patients have heart disease (${pct(gr.rate, 0)})`, e);
    });
    hit.addEventListener("mouseleave", () => {
      root.classList.remove("dim");
      g.classList.remove("active");
      hideTip();
    });
  });
  svg("line", { x1: x(0), x2: x(0), y1: m.t, y2: H - m.b, class: "baseline" }, root);
  svg("line", { x1: x(d.overall_rate), x2: x(d.overall_rate), y1: m.t - 6, y2: H - m.b, style: "stroke:var(--ink);stroke-width:1.5" }, root);
  svg("text", { x: x(d.overall_rate), y: m.t - 10, "text-anchor": "middle", class: "label-mid" }, root).textContent = `All patients ${Math.round(d.overall_rate * 100)}%`;

  $("#explore-table").innerHTML = `
    <thead><tr><th>Group</th><th class="num">Patients</th><th class="num">With heart disease</th><th class="num">Rate</th></tr></thead>
    <tbody>${d.groups.map((gr) => `
      <tr><td>${escapeHtml(gr.label)}</td><td class="num">${gr.n}</td><td class="num">${gr.disease}</td><td class="num">${pct(gr.rate)}</td></tr>`).join("")}
    </tbody>`;
}

/* ------------------------------------------------------------------ theme */

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch (e) {}
  renderConfusion(state.meta.metrics.confusion_matrix);
}

/* ------------------------------------------------------------------ boot */

async function boot() {
  hydrateIcons();
  $("#theme-toggle").addEventListener("click", toggleTheme);

  try {
    state.meta = await api("/api/meta");
  } catch (err) {
    $("#lede").textContent = "The model server is not responding. Start it with: python server.py";
    return;
  }

  buildForm();
  setPatient(typicalPatient());

  $("#clear").addEventListener("click", clearAll);
  $("#reset").addEventListener("click", () => {
    state.demo = null;
    setPatient(typicalPatient());
  });
  for (const btn of $$("[data-demo]")) btn.addEventListener("click", () => loadDemo(btn.dataset.demo));

  watchMiniResult();
  renderModelSection();
  renderRoc();
  renderImportance();
  buildFeaturePicker();
  await loadExplore(state.exploreFeature);

  let lastWidth = window.innerWidth;
  window.addEventListener("resize", debounce(() => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    renderRoc();
    renderImportance();
    renderExplore();
  }, 150));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
    renderConfusion(state.meta.metrics.confusion_matrix));
}

boot();
