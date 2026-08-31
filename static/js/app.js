/* 轮胎型号工作台 - GitHub Pages 静态版（只读） */
(function () {
  "use strict";

  let allModels = [];
  let currentDetail = null;
  let currentTab = "images";

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
      card.onclick = () => openDetail(m.name);
      const thumb = m.thumb
        ? '<img class="model-thumb" src="' + fileUrl(m.name, m.thumb) + '" loading="lazy" alt="">'
        : '<div class="model-thumb">🛞</div>';
      card.innerHTML =
        thumb +
        '<div class="model-info">' +
        '  <div class="model-name">' + esc(m.name) + '</div>' +
        '  <div class="model-meta"><span>📷 ' + m.image_count + ' 张</span><span>🎬 ' + m.video_count + ' 个</span><span class="model-arrow">›</span></div>' +
        '</div>';
      els.modelList.appendChild(card);
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
        box.innerHTML =
          '<a href="' + fileUrl(m.name, f) + '" target="_blank"><img loading="lazy" src="' + fileUrl(m.name, f) + '" alt=""></a>' +
          '<div class="img-name">' + esc(f) + '</div>' +
          '<div class="img-ops"><a class="btn btn-outline btn-sm" href="' + fileUrl(m.name, f) + '" download>下载</a></div>';
        wrap.appendChild(box);
      });
      els.detailContent.appendChild(wrap);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "video-list";
      items.forEach((f) => {
        const box = document.createElement("div");
        box.className = "video-item";
        box.innerHTML =
          '<video controls preload="metadata" src="' + fileUrl(m.name, f) + '"></video>' +
          '<div class="video-name">' + esc(f) + '</div>' +
          '<div class="video-ops"><a class="btn btn-outline btn-sm" href="' + fileUrl(m.name, f) + '" download>下载</a></div>';
        wrap.appendChild(box);
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
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      currentTab = t.dataset.tab;
      renderDetailTab();
    });
  });

  loadModels();
})();
