/* 轮胎型号工作台 - GitHub Pages 静态版（只读） */
(function () {
  "use strict";

  const OWNER = "chencanxiong";
  const REPO = "LUNTAI";
  const API_BASE = "https://api.github.com/repos/" + OWNER + "/" + REPO;
  const TOKEN_KEY = "gh_token";

  let allModels = [];
  let currentDetail = null;
  let currentTab = "images";
  let deleting = false;

  const $ = (id) => document.getElementById(id);
  const els = {
    search: $("searchInput"),
    filterType: $("filterType"),
    filterSort: $("filterSort"),
    modelList: $("modelList"),
    empty: $("emptyTip"),
    pageList: $("pageList"),
    pageDetail: $("pageDetail"),
    btnBackDetail: $("btnBackDetail"),
    detailTitle: $("detailTitle"),
    detailContent: $("detailContent"),
    btnDownloadZip: $("btnDownloadZip"),
    btnDeleteModel: $("btnDeleteModel"),
    btnSettings: $("btnSettings"),
    authBadge: $("authBadge"),
    settingsModal: $("settingsModal"),
    ghTokenInput: $("ghTokenInput"),
    btnSaveToken: $("btnSaveToken"),
    btnClearToken: $("btnClearToken"),
    toast: $("toast"),
  };

  function toast(msg, ms) {
    els.toast.textContent = msg;
    els.toast.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.add("hidden"), ms || 2400);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function enc(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  /* ---------- 管理（Token） ---------- */
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function hasAdmin() {
    return !!getToken();
  }
  function applyAuthUI() {
    const admin = hasAdmin();
    els.authBadge.textContent = admin ? "管理模式" : "云端只读";
    els.authBadge.classList.toggle("chip-danger", !admin);
    document.querySelectorAll(".delete-required").forEach((el) => el.classList.toggle("hidden", !admin));
    els.btnSettings.classList.toggle("chip-danger", admin);
  }

  /* ---------- GitHub API ---------- */
  async function ghRequest(path, options) {
    options = options || {};
    const headers = Object.assign({
      Authorization: "Bearer " + getToken(),
      Accept: "application/vnd.github+json"
    }, options.headers || {});
    const res = await fetch(API_BASE + path, Object.assign({ method: "GET", headers: headers }, options));
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try { const j = await res.json(); msg = j.message || msg; } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }
  async function deleteGitFile(path) {
    const j = await ghRequest("/contents/" + enc(path));
    await ghRequest("/contents/" + enc(path), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "delete: " + path, sha: j.sha })
    });
  }
  async function listRepoFiles() {
    const j = await ghRequest("/git/trees/main?recursive=1");
    return (j.tree || []).filter((t) => t.type === "blob").map((t) => t.path);
  }
  async function updateDataJson(models, msg) {
    const j = await ghRequest("/contents/data.json");
    const content = btoa(unescape(encodeURIComponent(JSON.stringify({ models: models }, null, 2))));
    await ghRequest("/contents/data.json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg || "delete: 更新型号清单", content: content, sha: j.sha })
    });
  }

  /* ---------- 删除型号 ---------- */
  async function deleteModel(name) {
    if (!hasAdmin() || deleting) return;
    if (!confirm('确定删除型号「' + name + '」？\n将删除该型号下所有图片/视频并更新云端 data.json，此操作不可恢复！')) return;
    deleting = true;
    const btn = els.btnDeleteModel;
    if (btn) { btn.disabled = true; btn.textContent = "删除中..."; }
    toast("正在删除型号，请稍候...", 60000);
    try {
      const prefix = "uploads/" + name + "/";
      const all = await listRepoFiles();
      const targets = all.filter((p) => p.indexOf(prefix) === 0);
      for (const p of targets) {
        await deleteGitFile(p);
      }
      allModels = allModels.filter((m) => m.name !== name);
      await updateDataJson(allModels, "delete: " + name);
      toast("型号已删除");
      currentDetail = null;
      showPage("pageList");
      renderList();
    } catch (e) {
      toast("删除失败：" + e.message);
    } finally {
      deleting = false;
      if (btn) { btn.disabled = false; btn.textContent = "删除型号"; }
    }
  }

  /* ---------- 删除单个文件 ---------- */
  async function deleteFileFromModel(name, file) {
    if (!hasAdmin() || deleting) return;
    if (!confirm('确定删除文件「' + file + '」？\n此操作不可恢复！')) return;
    deleting = true;
    toast("正在删除文件，请稍候...", 60000);
    try {
      await deleteGitFile("uploads/" + name + "/" + file);
      const m = allModels.find((x) => x.name === name);
      if (m) {
        m.images = (m.images || []).filter((f) => f !== file);
        m.videos = (m.videos || []).filter((f) => f !== file);
        if (m.thumb === file) m.thumb = (m.images[0] || "");
        m.image_count = m.images.length;
        m.video_count = m.videos.length;
      }
      await updateDataJson(allModels, "delete: " + file);
      toast("文件已删除");
      if (currentDetail && currentDetail.name === name) renderDetailTab();
      renderList();
    } catch (e) {
      toast("删除失败：" + e.message);
    } finally {
      deleting = false;
    }
  }

  function fileUrl(model, file) {
    return "uploads/" + enc(model) + "/" + enc(file);
  }

  function showPage(id) {
    ["pageList", "pageDetail"].forEach((p) => $(p).classList.toggle("hidden", p !== id));
    window.scrollTo(0, 0);
  }

  /* ---------- 加载数据 ---------- */
  async function loadModels() {
    try {
      const res = await fetch("data.json?t=" + Date.now());
      if (!res.ok) throw new Error("data.json 不存在");
      const data = await res.json();
      allModels = data.models || [];
    } catch (e) {
      allModels = [];
      toast("数据加载失败：" + e.message);
    }
    renderList();
  }

  function renderList() {
    const q = els.search.value.trim().toLowerCase();
    const ftype = els.filterType.value;
    const sort = els.filterSort.value;
    let list = allModels.slice();
    if (q) list = list.filter((m) => m.name.toLowerCase().includes(q));
    if (ftype === "image") list = list.filter((m) => m.image_count > 0);
    else if (ftype === "video") list = list.filter((m) => m.video_count > 0);
    if (sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    } else {
      list.sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")));
    }
    els.modelList.innerHTML = "";
    els.empty.classList.toggle("hidden", list.length > 0);
    list.forEach((m) => {
      const card = document.createElement("div");
      card.className = "model-card";
      card.onclick = (e) => {
        if (e.target.closest(".model-del")) return;
        openDetail(m.name);
      };
      const thumb = m.thumb
        ? '<img class="model-thumb" src="' + fileUrl(m.name, m.thumb) + '" loading="lazy" alt="">'
        : '<div class="model-thumb">🛞</div>';
      const delBtn = hasAdmin()
        ? '<button class="btn btn-danger btn-sm model-del" title="删除该型号">删除</button>'
        : '';
      card.innerHTML =
        thumb +
        '<div class="model-info">' +
        '  <div class="model-name">' + esc(m.name) + '</div>' +
        '  <div class="model-meta"><span>📷 ' + m.image_count + ' 张</span><span>🎬 ' + m.video_count + ' 个</span>' + delBtn + '<span class="model-arrow">›</span></div>' +
        '</div>';
      els.modelList.appendChild(card);
      if (hasAdmin()) {
        card.querySelector(".model-del").addEventListener("click", () => deleteModel(m.name));
      }
    });
  }

  /* ---------- 详情 ---------- */
  function openDetail(name) {
    const m = allModels.find((x) => x.name === name);
    if (!m) return;
    currentDetail = m;
    currentTab = "images";
    els.detailTitle.textContent = m.name;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "images"));
    renderDetailTab();
    showPage("pageDetail");
  }

  function renderDetailTab() {
    const m = currentDetail;
    if (!m) return;
    const isImgTab = currentTab === "images";
    const items = isImgTab ? m.images : m.videos;
    els.detailContent.innerHTML = "";
    if (!items.length) {
      els.detailContent.innerHTML = '<div class="section-empty">该分类暂无文件</div>';
      return;
    }
    if (isImgTab) {
      const wrap = document.createElement("div");
      wrap.className = "image-grid";
      items.forEach((f) => {
        const box = document.createElement("div");
        box.className = "img-item";
        const delBtn = hasAdmin()
          ? '<button class="btn btn-danger btn-sm file-del" title="删除该文件">删除</button>'
          : '';
        box.innerHTML =
          '<a href="' + fileUrl(m.name, f) + '" target="_blank"><img loading="lazy" src="' + fileUrl(m.name, f) + '" alt=""></a>' +
          '<div class="img-name">' + esc(f) + '</div>' +
          '<div class="img-ops"><a class="btn btn-outline btn-sm" href="' + fileUrl(m.name, f) + '" download>下载</a>' + delBtn + '</div>';
        wrap.appendChild(box);
        if (hasAdmin()) {
          box.querySelector(".file-del").addEventListener("click", () => deleteFileFromModel(m.name, f));
        }
      });
      els.detailContent.appendChild(wrap);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "video-list";
      items.forEach((f) => {
        const box = document.createElement("div");
        box.className = "video-item";
        const delBtn = hasAdmin()
          ? '<button class="btn btn-danger btn-sm file-del" title="删除该文件">删除</button>'
          : '';
        box.innerHTML =
          '<video controls preload="metadata" src="' + fileUrl(m.name, f) + '"></video>' +
          '<div class="video-name">' + esc(f) + '</div>' +
          '<div class="video-ops"><a class="btn btn-outline btn-sm" href="' + fileUrl(m.name, f) + '" download>下载</a>' + delBtn + '</div>';
        wrap.appendChild(box);
        if (hasAdmin()) {
          box.querySelector(".file-del").addEventListener("click", () => deleteFileFromModel(m.name, f));
        }
      });
      els.detailContent.appendChild(wrap);
    }
  }

  /* ---------- 打包下载（前端 JSZip） ---------- */
  async function downloadZip() {
    const m = currentDetail;
    if (!m) return;
    if (typeof JSZip === "undefined") { toast("打包组件未加载，请检查网络"); return; }
    toast("正在打包，请稍候...", 60000);
    try {
      const zip = new JSZip();
      const files = m.images.concat(m.videos);
      for (const f of files) {
        const res = await fetch(fileUrl(m.name, f));
        if (res.ok) zip.file(f, await res.blob());
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = m.name + ".zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast("打包完成，已开始下载");
    } catch (e) {
      toast("打包失败：" + e.message);
    }
  }

  /* ---------- 事件 ---------- */
  els.search.addEventListener("input", () => { clearTimeout(loadModels._t); loadModels._t = setTimeout(renderList, 250); });
  els.filterType.addEventListener("change", renderList);
  els.filterSort.addEventListener("change", renderList);
  els.btnBackDetail.addEventListener("click", () => { currentDetail = null; showPage("pageList"); });
  els.btnDownloadZip.addEventListener("click", downloadZip);
  els.btnDeleteModel.addEventListener("click", () => { if (currentDetail) deleteModel(currentDetail.name); });
  els.btnSettings.addEventListener("click", () => {
    els.ghTokenInput.value = getToken();
    els.settingsModal.classList.remove("hidden");
  });
  document.querySelectorAll("[data-close='settings']").forEach((el) => {
    el.addEventListener("click", () => els.settingsModal.classList.add("hidden"));
  });
  els.btnSaveToken.addEventListener("click", () => {
    const v = els.ghTokenInput.value.trim();
    if (v) {
      localStorage.setItem(TOKEN_KEY, v);
      els.settingsModal.classList.add("hidden");
      applyAuthUI();
      renderList();
      if (currentDetail) renderDetailTab();
      toast("已保存 Token，管理功能已启用");
    } else {
      toast("Token 不能为空");
    }
  });
  els.btnClearToken.addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    els.ghTokenInput.value = "";
    els.settingsModal.classList.add("hidden");
    applyAuthUI();
    renderList();
    if (currentDetail) renderDetailTab();
    toast("已清除 Token，恢复只读模式");
  });
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      currentTab = t.dataset.tab;
      renderDetailTab();
    });
  });

  applyAuthUI();
  loadModels();
})();
