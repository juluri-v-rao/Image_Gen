/* FIBO Image Edit: static client for the Bria v2 API.
 * The API key stays in this browser's localStorage and is sent only to the Bria API. */
(() => {
  "use strict";

  const DEFAULTS = {
    baseUrl: "https://engine.prod.bria-api.com/v2",
    endpoint: "/image/edit",
  };
  const LS = { key: "bria_api_key", baseUrl: "bria_base_url", endpoint: "bria_endpoint" };
  const POLL_MS = 2000;
  const POLL_MAX = 90; // about 3 minutes

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} },
  };

  /* ---------------- API key handling ---------------- */
  const mask = (k) => (!k ? "none" : k.length <= 8 ? "••••" : `${k.slice(0, 4)}••••${k.slice(-4)}`);

  function refreshKeyStatus() {
    const k = store.get(LS.key);
    const el = $("keyStatus");
    el.textContent = k ? `API key: ${mask(k)}` : "No API key";
    el.classList.toggle("set", !!k);
  }

  function openKeyModal() {
    $("currentKeyMasked").textContent = mask(store.get(LS.key));
    $("newKey").value = "";
    $("newKey").type = "password";
    $("keyError").hidden = true;
    $("keyModal").hidden = false;
    $("newKey").focus();
  }
  const closeKeyModal = () => { $("keyModal").hidden = true; };

  // Promise-based OK / Cancel dialog
  function confirmDialog(text, okLabel = "OK") {
    return new Promise((resolve) => {
      $("confirmText").textContent = text;
      $("confirmOk").textContent = okLabel;
      $("confirmModal").hidden = false;
      $("confirmOk").focus();
      const done = (val) => {
        $("confirmModal").hidden = true;
        $("confirmOk").removeEventListener("click", onOk);
        $("confirmCancel").removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKey, true);
        resolve(val);
      };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } };
      $("confirmOk").addEventListener("click", onOk);
      $("confirmCancel").addEventListener("click", onCancel);
      document.addEventListener("keydown", onKey, true);
    });
  }

  async function saveKey() {
    const v = $("newKey").value.trim();
    if (!v) {
      $("keyError").textContent = "Please enter an API key.";
      $("keyError").hidden = false;
      return;
    }
    const had = !!store.get(LS.key);
    const ok = await confirmDialog(
      had ? `Replace the current API key (${mask(store.get(LS.key))}) with the new key (${mask(v)})?`
          : `Save the API key (${mask(v)}) in this browser?`
    );
    if (!ok) return; // stay in the key dialog so the user can edit or cancel
    store.set(LS.key, v);
    refreshKeyStatus();
    closeKeyModal();
    setStatus("done", "API key updated.");
  }

  async function removeKey() {
    if (!store.get(LS.key)) { closeKeyModal(); return; }
    const ok = await confirmDialog("Remove the saved API key from this browser?", "Remove");
    if (!ok) return;
    store.set(LS.key, "");
    refreshKeyStatus();
    closeKeyModal();
    setStatus("idle", "API key removed.");
  }

  /* ---------------- Input image ---------------- */
  let imageSource = "upload";
  let imageDataUrl = "";
  let maskDataUrl = "";

  const readAsDataUrl = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  // Bria expects raw base64 (no "data:image/...;base64," prefix) or a public URL.
  const stripPrefix = (d) => d.replace(/^data:[^;]+;base64,/, "");

  async function setImageFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    imageDataUrl = await readAsDataUrl(file);
    $("inputPreview").src = imageDataUrl;
    $("inputPreview").hidden = false;
    $("dropText").hidden = true;
  }

  function initImageInputs() {
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
      imageSource = t.dataset.src;
      $("srcUpload").hidden = imageSource !== "upload";
      $("srcUrl").hidden = imageSource !== "url";
    }));
    $("imageFile").addEventListener("change", (e) => setImageFile(e.target.files[0]));
    const dz = $("dropZone");
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
    dz.addEventListener("drop", (e) => setImageFile(e.dataTransfer.files[0]));
    $("maskFile").addEventListener("change", async (e) => {
      maskDataUrl = e.target.files[0] ? await readAsDataUrl(e.target.files[0]) : "";
    });
  }

  /* ---------------- Options ---------------- */
  function initOptions() {
    const bind = (input, out) => { const f = () => ($(out).textContent = $(input).value); $(input).addEventListener("input", f); f(); };
    bind("steps", "stepsOut");
    bind("guidance", "guidanceOut");
    $("randSeed").addEventListener("click", () => { $("seed").value = Math.floor(Math.random() * 2 ** 31); });

    $("baseUrl").value = store.get(LS.baseUrl) || DEFAULTS.baseUrl;
    $("endpoint").value = store.get(LS.endpoint) || DEFAULTS.endpoint;
    $("baseUrl").addEventListener("change", () => store.set(LS.baseUrl, $("baseUrl").value.trim()));
    $("endpoint").addEventListener("change", () => store.set(LS.endpoint, $("endpoint").value.trim()));
    $("resetApi").addEventListener("click", () => {
      $("baseUrl").value = DEFAULTS.baseUrl; $("endpoint").value = DEFAULTS.endpoint;
      store.set(LS.baseUrl, ""); store.set(LS.endpoint, "");
    });
  }

  function buildBody(seedOverride) {
    const image = imageSource === "url" ? $("imageUrl").value.trim() : (imageDataUrl && stripPrefix(imageDataUrl));
    if (!image) throw new Error("Please add an input image.");
    const instruction = $("instruction").value.trim();
    if (!instruction) throw new Error("Please enter a prompt / edit instruction.");

    const body = {
      images: [image],
      instruction,
      steps_num: Number($("steps").value),
      guidance_scale: Number($("guidance").value),
      sync: $("syncMode").checked,
    };
    if (maskDataUrl) body.mask = stripPrefix(maskDataUrl);
    const neg = $("negativePrompt").value.trim();
    if (neg) body.negative_prompt = neg;
    if (seedOverride !== undefined) body.seed = seedOverride;
    if ($("modPrompt").checked) body.prompt_content_moderation = true;
    if ($("modInput").checked) body.visual_input_content_moderation = true;
    if ($("modOutput").checked) body.visual_output_content_moderation = true;

    const extra = $("extraJson").value.trim();
    if (extra) {
      let obj;
      try { obj = JSON.parse(extra); } catch { throw new Error("Extra parameters must be valid JSON."); }
      // A value of null removes that key from the request.
      for (const [k, v] of Object.entries(obj)) v === null ? delete body[k] : (body[k] = v);
    }
    return body;
  }

  /* ---------------- API calls ---------------- */
  const apiBase = () => ($("baseUrl").value.trim() || DEFAULTS.baseUrl).replace(/\/+$/, "");
  const apiPath = () => { const p = $("endpoint").value.trim() || DEFAULTS.endpoint; return p.startsWith("/") ? p : `/${p}`; };
  const headers = () => ({ "Content-Type": "application/json", api_token: store.get(LS.key) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function log(label, data) {
    const redact = (k, v) => (typeof v === "string" && v.length > 300 ? `${v.slice(0, 60)}… (${v.length} chars)` : v);
    $("log").textContent += `\n── ${label} ──\n${typeof data === "string" ? data : JSON.stringify(data, redact, 2)}\n`;
  }

  async function fetchJson(url, opts) {
    let res;
    try { res = await fetch(url, opts); }
    catch (e) {
      throw new Error(`Network error calling ${url}.\nThe browser may be blocking the request (CORS), or the URL is wrong.\n${e.message}`);
    }
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || json?.detail || text || res.statusText;
      throw new Error(`HTTP ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
    }
    return json;
  }

  // Collect image URLs or base64 images from any response shape.
  function extractImages(obj, out = []) {
    if (!obj) return out;
    if (typeof obj === "string") {
      if (/^https?:\/\//.test(obj) || obj.startsWith("data:image/")) out.push(obj);
      return out;
    }
    if (Array.isArray(obj)) { obj.forEach((x) => extractImages(x, out)); return out; }
    if (typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        if (/status_url/i.test(k)) continue;
        if (typeof v === "string" && /image|url/i.test(k)) extractImages(v, out);
        else if (typeof v === "object") extractImages(v, out);
      }
    }
    return [...new Set(out)];
  }

  async function runOne(body, idx, total) {
    const tag = total > 1 ? ` [${idx + 1}/${total}]` : "";
    log(`POST ${apiBase()}${apiPath()}${tag}`, body);
    let data = await fetchJson(`${apiBase()}${apiPath()}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    log(`Response${tag}`, data);

    let images = extractImages(data.result ?? data);
    if (images.length) return { images, data };

    const statusUrl = data.status_url || (data.request_id && `${apiBase()}/status/${data.request_id}`);
    if (!statusUrl) throw new Error("The response had no image and no request_id/status_url. See the log.");

    for (let i = 0; i < POLL_MAX; i++) {
      setStatus("working", `Processing${tag}… (${(i * POLL_MS) / 1000}s)`);
      await sleep(POLL_MS);
      data = await fetchJson(statusUrl, { headers: headers() });
      const st = String(data.status || "").toUpperCase();
      if (st === "COMPLETED" || st === "SUCCEEDED" || st === "SUCCESS" || st === "DONE") {
        log(`Status${tag}`, data);
        images = extractImages(data.result ?? data);
        if (!images.length) throw new Error("The request completed, but no image was found in the result. See the log.");
        return { images, data };
      }
      if (st === "ERROR" || st === "FAILED" || st === "UNKNOWN") {
        log(`Status${tag}`, data);
        throw new Error(`Request failed: ${data.error?.message || JSON.stringify(data.error || data)}`);
      }
    }
    throw new Error("Timed out waiting for the result.");
  }

  /* ---------------- UI output ---------------- */
  function setStatus(kind, text) { const s = $("status"); s.className = `status ${kind}`; s.textContent = text; }

  function addResult(src, seed) {
    const card = document.createElement("div");
    card.className = "result-card";
    const img = document.createElement("img");
    img.src = src; img.alt = "Edited result";
    const actions = document.createElement("div");
    actions.className = "actions";
    const open = document.createElement("a");
    open.href = src; open.target = "_blank"; open.rel = "noopener"; open.textContent = "Open / download";
    actions.append(open);
    if (seed !== undefined) { const s = document.createElement("span"); s.className = "muted"; s.textContent = `seed ${seed}`; actions.append(s); }
    card.append(img, actions);
    $("results").prepend(card);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!store.get(LS.key)) { setStatus("error", "Add your Bria API key first."); openKeyModal(); return; }

    const n = Math.min(4, Math.max(1, Number($("numResults").value) || 1));
    const seedStr = $("seed").value.trim();
    const baseSeed = seedStr === "" ? undefined : Number(seedStr);
    let bodies;
    try {
      bodies = Array.from({ length: n }, (_, i) => buildBody(baseSeed === undefined ? undefined : baseSeed + i));
    } catch (err) { setStatus("error", err.message); return; }

    $("submitBtn").disabled = true;
    $("submitBtn").textContent = "Generating…";
    $("log").textContent = "";
    setStatus("working", "Sending request…");
    try {
      const results = await Promise.allSettled(bodies.map((b, i) => runOne(b, i, n)));
      let okCount = 0; const errors = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") { okCount++; r.value.images.forEach((src) => addResult(src, bodies[i].seed ?? r.value.data?.result?.seed)); }
        else errors.push(r.reason.message);
      });
      if (errors.length && !okCount) setStatus("error", errors.join("\n\n"));
      else if (errors.length) setStatus("error", `${okCount}/${n} succeeded.\n${errors.join("\n")}`);
      else setStatus("done", `Done: ${okCount} result${okCount > 1 ? "s" : ""}.`);
    } finally {
      $("submitBtn").disabled = false;
      $("submitBtn").textContent = "Generate";
    }
  }

  /* ---------------- Init ---------------- */
  function init() {
    refreshKeyStatus();
    initImageInputs();
    initOptions();
    $("editForm").addEventListener("submit", onSubmit);
    $("openKeyModal").addEventListener("click", openKeyModal);
    $("cancelKey").addEventListener("click", closeKeyModal);
    $("saveKey").addEventListener("click", saveKey);
    $("removeKey").addEventListener("click", removeKey);
    $("newKey").addEventListener("keydown", (e) => { if (e.key === "Enter") saveKey(); });
    $("toggleKey").addEventListener("click", () => { const k = $("newKey"); k.type = k.type === "password" ? "text" : "password"; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("keyModal").hidden && $("confirmModal").hidden) closeKeyModal(); });
    if (!store.get(LS.key)) setStatus("idle", "Click “Update API key” to add your Bria API key.");
  }
  init();
})();
