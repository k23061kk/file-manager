// 変数宣言
let currentDirHandle = null;
let parentHandles = [];
let fileHandles = [];
let currentFileHandle = null;
let sortAscending = true;
let selectedHandles = new Set();
let viewMode = 'list'; // list or grid
let logs = [];

function log(msg) {
    logs.push(`${new Date().toLocaleTimeString()}: ${msg}`);
    const logArea = document.getElementById('log-area');
    logArea.textContent = logs.slice(-50).join('\n');
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function updateBreadcrumbs() {
    const bc = document.getElementById('breadcrumbs');
    if (!currentDirHandle) {
        bc.textContent = 'フォルダを開いてください';
        return;
    }
    let pathArr = parentHandles.map(h => h.name);
    pathArr.push(currentDirHandle.name);
    bc.innerHTML = pathArr.map((p, i) => {
        return `<a href="#" onclick="jumpToFolder(${i})">${p}</a>`;
    }).join(' / ');
}

async function jumpToFolder(index) {
    if (index < 0 || index >= parentHandles.length) return;
    currentDirHandle = parentHandles[index];
    parentHandles = parentHandles.slice(0, index);
    await loadFileHandles();
    renderFileList();
    updateBreadcrumbs();
}

async function openFolder() {
    try {
        currentDirHandle = await window.showDirectoryPicker();
        parentHandles = [];
        await loadFileHandles();
        renderFileList();
        updateBreadcrumbs();
        log(`フォルダを開きました: ${currentDirHandle.name}`);
    } catch (e) {
        log('フォルダ選択がキャンセルされました');
    }
}

async function goUp() {
    if (parentHandles.length === 0) {
        alert('これ以上上のフォルダはありません');
        return;
    }
    currentDirHandle = parentHandles.pop();
    await loadFileHandles();
    renderFileList();
    updateBreadcrumbs();
    log(`上のフォルダに移動: ${currentDirHandle.name}`);
}

async function loadFileHandles() {
    fileHandles = [];
    for await (const entry of currentDirHandle.values()) {
        fileHandles.push(entry);
    }
    await applyFilters();
}

function getFileTypeCategory(file) {
    if (!file) return 'other';
    const name = file.name.toLowerCase();
    if (file.type.startsWith('image/') || name.match(/\.(jpg|jpeg|png|gif|webp)$/)) return 'image';
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (file.type.startsWith('audio/') || name.match(/\.(mp3|wav|ogg)$/)) return 'audio';
    if (file.type.startsWith('video/') || name.match(/\.(mp4|webm)$/)) return 'video';
    if (file.type.startsWith('text/') || name.match(/\.(txt|md|html|js|css)$/)) return 'text';
    return 'other';
}

async function applyFilters() {
    const typeFilter = document.getElementById('file-type-filter').value;
    const minSize = parseInt(document.getElementById('min-size').value) * 1024 || 0;
    const maxSize = parseInt(document.getElementById('max-size').value) * 1024 || Infinity;
    const minDateStr = document.getElementById('min-date').value;
    const maxDateStr = document.getElementById('max-date').value;
    const minDate = minDateStr ? new Date(minDateStr) : new Date(0);
    const maxDate = maxDateStr ? new Date(maxDateStr) : new Date(8640000000000000);

    filteredFileHandles = [];

    for (const handle of fileHandles) {
        if (handle.kind === 'directory') {
            filteredFileHandles.push(handle);
            continue;
        }
        const file = await handle.getFile();
        const type = getFileTypeCategory(file);
        if (typeFilter && typeFilter !== type) continue;
        if (file.size < minSize || file.size > maxSize) continue;
        const mtime = new Date(file.lastModified);
        if (mtime < minDate || mtime > maxDate) continue;
        filteredFileHandles.push(handle);
    }
    await sortAndRender();
}

async function sortAndRender() {
    const sort = document.getElementById('sort-select') ? document.getElementById('sort-select').value : 'name';
    // ソート関数（名前 or 更新日時）
    const cmp = async (a, b) => {
        if (a.kind === 'directory' && b.kind !== 'directory') return -1;
        if (a.kind !== 'directory' && b.kind === 'directory') return 1;
        if (sort === 'name') return a.name.localeCompare(b.name);
        const af = await a.getFile();
        const bf = await b.getFile();
        return af.lastModified - bf.lastModified;
    };

    filteredFileHandles.sort(async (a, b) => {
        const result = await cmp(a, b);
        return sortAscending ? result : -result;
    });

    renderFileList();
}

function toggleSortOrder() {
    sortAscending = !sortAscending;
    sortAndRender();
    log(`並び替え順を${sortAscending ? '昇順' : '降順'}に変更`);
}

function toggleViewMode() {
    viewMode = viewMode === 'list' ? 'grid' : 'list';
    renderFileList();
    log(`表示モードを${viewMode}に変更`);
}

function hideAllPreviews() {
    const ids = ['file-content', 'image-preview', 'pdf-preview', 'audio-preview', 'video-preview', 'markdown-preview'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    document.getElementById('preview-controls').style.display = 'none';
    document.getElementById('file-content').value = '';
    document.getElementById('markdown-preview').innerHTML = '';
}

async function renderFileList(filter = '') {
    const listDiv = document.getElementById('file-list');
    listDiv.innerHTML = '';
    hideAllPreviews();

    const ul = document.createElement('ul');
    ul.className = viewMode;
    listDiv.appendChild(ul);

    const query = document.getElementById('search-box').value.toLowerCase();

    for (const handle of filteredFileHandles) {
        if (filter && !handle.name.toLowerCase().includes(filter)) continue;
        if (query && !handle.name.toLowerCase().includes(query)) continue;

        const li = document.createElement('li');
        li.className = 'file-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'file-check';
        checkbox.onclick = e => {
            e.stopPropagation();
            if (checkbox.checked) selectedHandles.add(handle);
            else selectedHandles.delete(handle);
            log(`選択 ${checkbox.checked ? '追加' : '解除'}: ${handle.name}`);
        };

        const iconSpan = document.createElement('span');
        iconSpan.className = 'icon';

        if (handle.kind === 'directory') {
            iconSpan.textContent = '📁';
            li.onclick = async () => {
                parentHandles.push(currentDirHandle);
                currentDirHandle = handle;
                await loadFileHandles();
                renderFileList();
                updateBreadcrumbs();
                log(`フォルダ移動: ${handle.name}`);
            };
        } else {
            const file = await handle.getFile();
            const type = getFileTypeCategory(file);
            if (type === 'image') iconSpan.textContent = '🖼️';
            else if (type === 'pdf') iconSpan.textContent = '📕';
            else if (type === 'audio') iconSpan.textContent = '🎵';
            else if (type === 'video') iconSpan.textContent = '🎬';
            else iconSpan.textContent = '📄';

            li.onclick = e => {
                e.stopPropagation();
                openFile(handle);
            };
            li.ondblclick = () => {
                const url = URL.createObjectURL(file);
                window.open(url, '_blank');
            };
            li.oncontextmenu = async e => {
                e.preventDefault();
                const newName = prompt('新しいファイル名:', handle.name);
                if (newName && newName !== handle.name) {
                    renameFile(handle, newName);
                }
            };
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = handle.name;

        li.prepend(checkbox);
        li.prepend(iconSpan);
        li.appendChild(nameSpan);
        ul.appendChild(li);
    }
}

async function openFile(handle) {
    const file = await handle.getFile();
    updateFileInfo(file);
    hideAllPreviews();
    currentFileHandle = handle;

    const type = getFileTypeCategory(file);
    const ext = file.name.split('.').pop().toLowerCase();

    if (type === 'image') {
        const img = document.getElementById('image-preview');
        img.src = URL.createObjectURL(file);
        img.style.display = 'block';
    } else if (type === 'pdf') {
        const pdf = document.getElementById('pdf-preview');
        pdf.src = URL.createObjectURL(file);
        pdf.style.display = 'block';
    } else if (type === 'audio') {
        const audio = document.getElementById('audio-preview');
        audio.src = URL.createObjectURL(file);
        audio.style.display = 'block';
    } else if (type === 'video') {
        const video = document.getElementById('video-preview');
        video.src = URL.createObjectURL(file);
        video.style.display = 'block';
    } else if (type === 'text') {
        if (ext === 'md') {
            const text = await file.text();
            const mdPreview = document.getElementById('markdown-preview');
            mdPreview.innerHTML = marked.parse(text);
            mdPreview.style.display = 'block';
            document.getElementById('preview-controls').style.display = 'block';
        } else if (ext === 'html') {
            const text = await file.text();
            const mdPreview = document.getElementById('markdown-preview');
            mdPreview.innerHTML = text;
            mdPreview.style.display = 'block';
            document.getElementById('preview-controls').style.display = 'block';
        } else {
            const contentArea = document.getElementById('file-content');
            contentArea.value = await file.text();
            contentArea.style.display = 'block';
            document.getElementById('preview-controls').style.display = 'block';
        }
    } else {
        alert('プレビューできないファイル形式です。ダブルクリックで開いてください。');
    }
    log(`ファイルを開きました: ${file.name}`);
}

function reloadPreview() {
    if (!currentFileHandle) return;
    openFile(currentFileHandle);
    log('プレビュー再読み込みしました');
}

function updateFileInfo(file) {
    const info = `
名前: ${file.name}
サイズ: ${formatBytes(file.size)}
種類: ${file.type || '不明'}
更新日時: ${new Date(file.lastModified).toLocaleString()}
  `;
    document.getElementById('info-box').textContent = info;
}

async function renameFile(handle, newName) {
    try {
        // File System Access API ではファイル名変更は直接できないためコピー＆削除の代替案が必要
        alert('ファイル名の変更はブラウザの制限でサポートされていません。');
        log(`リネーム試行（未対応）: ${handle.name} → ${newName}`);
    } catch (e) {
        alert('リネームに失敗しました。');
    }
}

function selectAllFiles(select) {
    selectedHandles.clear();
    if (select) {
        filteredFileHandles.forEach(h => {
            if (h.kind === 'file') selectedHandles.add(h);
        });
    }
    renderFileList();
    log(select ? '全ファイル選択' : '選択解除');
}

async function deleteSelectedFiles() {
    if (selectedHandles.size === 0) {
        alert('削除対象のファイルが選択されていません。');
        return;
    }
    if (!confirm(`${selectedHandles.size} 個のファイル・フォルダを削除しますか？`)) return;

    try {
        for (const handle of selectedHandles) {
            await currentDirHandle.removeEntry(handle.name, { recursive: true });
            log(`削除: ${handle.name}`);
        }
        selectedHandles.clear();
        await loadFileHandles();
        renderFileList();
    } catch (e) {
        alert('削除に失敗しました: ' + e.message);
    }
}

async function zipSelectedFiles() {
    alert('ZIP化機能はこの環境ではサポートしていません。');
}

async function createNewFolder() {
    if (!currentDirHandle) {
        alert('フォルダを開いてください');
        return;
    }
    const name = prompt('新規フォルダ名を入力してください');
    if (!name) return;
    try {
        await currentDirHandle.getDirectoryHandle(name, { create: true });
        log(`新規フォルダ作成: ${name}`);
        await loadFileHandles();
        renderFileList();
    } catch (e) {
        alert('フォルダ作成に失敗しました');
    }
}

function filterFiles() {
    applyFilters();
}

async function uploadFiles(event) {
    if (!currentDirHandle) {
        alert('フォルダを開いてください');
        return;
    }
    const files = event.target.files;
    for (const file of files) {
        try {
            const writable = await currentDirHandle.getFileHandle(file.name, { create: true });
            const writableStream = await writable.createWritable();
            await writableStream.write(file);
            await writableStream.close();
            log(`ファイルアップロード: ${file.name}`);
        } catch (e) {
            alert(`アップロードに失敗しました: ${file.name}`);
        }
    }
    await loadFileHandles();
    renderFileList();
}

window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        alert('ファイル保存機能は未実装です。');
        log('Ctrl+S キー押下（保存未実装）');
    }
});

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    updateBreadcrumbs();
    renderFileList();
});

function toggleDarkMode() {
    const app = document.getElementById('app');
    if (app.classList.contains('dark')) {
        app.classList.remove('dark');
        app.classList.add('light');
        log('ダークモード OFF');
    } else {
        app.classList.remove('light');
        app.classList.add('dark');
        log('ダークモード ON');
    }
}
