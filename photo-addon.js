/* Fitur attach foto untuk tab Job Completion.
   Dimuat SETELAH script utama (lihat cara pasang). Foto disimpan di IndexedDB browser
   (bukan di localStorage / Google Sheets), supaya data utama dan sinkron tidak membengkak. */
(function () {
  const MAXPH = 4;       // maksimal foto per item pekerjaan
  let PH = {};           // { idItem: [dataURL, ...] }

  // ---------- Penyimpanan foto (IndexedDB) ----------
  const idb = new Promise((ok, no) => {
    try {
      const r = indexedDB.open('wo-photos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('p');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    } catch (e) { no(e); }
  });
  const phSave = async id => {
    try {
      const d = await idb, st = d.transaction('p', 'readwrite').objectStore('p');
      if (PH[id] && PH[id].length) st.put(PH[id], id); else st.delete(id);
    } catch (e) {}
  };
  const phLoad = async () => {
    try {
      const d = await idb;
      await new Promise(ok => {
        const rq = d.transaction('p').objectStore('p').openCursor();
        rq.onsuccess = () => { const c = rq.result; if (c) { PH[c.key] = c.value; c.continue(); } else ok(); };
        rq.onerror = () => ok();
      });
    } catch (e) {}
  };

  // ---------- Util ----------
  const iid = it => it.id || (it.id = uid());

  async function shrink(file, max = 900) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      bmp = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
    }
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, s = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.75);
  }

  // ---------- Gaya ----------
  const st = document.createElement('style');
  st.textContent =
    '.phl{display:inline-block;border:1px solid var(--line);background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;margin:2px}' +
    '.phl:hover{border-color:var(--navy)}' +
    '.th{position:relative;display:inline-block;margin:2px}' +
    '.th img{width:56px;height:56px;object-fit:cover;border-radius:4px;display:block}' +
    '.th button{position:absolute;top:-5px;right:-5px;padding:0 5px;line-height:16px;font-size:11px;border-radius:50%}' +
    '@media print{table.d tr{break-inside:avoid}}';
  document.head.appendChild(st);

  // ---------- Form: kolom Foto di tabel Job Completion ----------
  function decorate() {
    const p = cur();
    if (!p || VW || IMP || S.tab != 'jc') return;
    const t = document.querySelector('#main .card.noprint.scroll table.f');
    if (!t || !t.rows[0] || t.rows[0].querySelector('[data-foto]')) return;
    const th = document.createElement('th'); th.textContent = 'Foto'; th.dataset.foto = '1';
    t.rows[0].insertBefore(th, t.rows[0].lastElementChild);
    p.jc.items.forEach((it, i) => {
      const row = t.rows[i + 1]; if (!row) return;
      const a = PH[iid(it)] || [];
      const td = document.createElement('td'); td.style.minWidth = '150px';
      td.innerHTML = a.map((s, j) =>
        '<span class="th"><img src="' + s + '" alt="foto"><button data-phd="' + i + '|' + j + '" title="Hapus foto">✕</button></span>').join('') +
        '<label class="phl">+ Foto<input type="file" accept="image/*" multiple hidden data-ph="' + i + '"></label>';
      row.insertBefore(td, row.lastElementChild);
    });
  }
  const _form = window.form;
  window.form = function () { _form(); decorate(); };

  // ---------- Dokumen: foto muncul di kolom Note ----------
  const _doc = window.doc;
  window.doc = function () {
    _doc();
    const p = cur(), d = document.querySelector('#doc');
    if (!p || !d || S.tab != 'jc') return;
    const rows = d.querySelectorAll('table.d tr');
    p.jc.items.forEach((it, i) => {
      const a = PH[it.id] || [], r = rows[i + 1];
      if (!r || !a.length || !r.cells[3]) return;
      r.cells[3].insertAdjacentHTML('beforeend',
        '<div class="phs" style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-top:4px">' +
        a.map(s => '<img src="' + s + '" alt="" style="width:100%;height:110px;object-fit:cover;display:block">').join('') + '</div>');
    });
  };

  // "Isi dari BOQ" membuat ulang item: pertahankan id agar foto tidak hilang
  const _gen = window.genItems;
  window.genItems = function (p) {
    const old = (p.jc && p.jc.items) || [];
    return _gen(p).map(n => { const o = old.find(x => x.desc == n.desc && x.id); if (o) n.id = o.id; return n; });
  };

  // ---------- Event ----------
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.ph == null) return;
    const p = cur(), it = p && p.jc.items[t.dataset.ph];
    if (!it) return;
    const id = iid(it);
    PH[id] = PH[id] || [];
    for (const f of t.files) {
      if (PH[id].length >= MAXPH) { alert('Maksimal ' + MAXPH + ' foto per item.'); break; }
      try { PH[id].push(await shrink(f)); } catch (err) { alert('Foto "' + f.name + '" tidak bisa dibaca.'); }
    }
    phSave(id); save(); form();
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('button[data-phd]');
    if (!b) return;
    const [i, j] = b.dataset.phd.split('|').map(Number), it = cur().jc.items[i];
    (PH[it.id] || []).splice(j, 1);
    phSave(it.id); form();
  });

  // Excel (HTML) tidak menampilkan foto base64: buang sementara supaya file tidak membengkak
  document.addEventListener('click', e => {
    if (!e.target.closest('#xls')) return;
    document.querySelectorAll('#doc .phs').forEach(x => x.remove());
    setTimeout(() => window.doc(), 0);
  }, true);

  // Muat foto tersimpan lalu gambar ulang
  phLoad().then(() => form());
})();
