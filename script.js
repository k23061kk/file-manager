// script.js
let currentDirHandle = null;
let parentHandles = [];
let fileHandles = [];
let currentFileHandle = null;
let sortAscending = true;

function hideAllPreviews() {
    document.getElementById('file-content').style.display = 'none';
    document.getElementById('image-preview').style.display = 'none';
    document.getElementById('pdf-preview').style.display = 'none';
    document.getElementById('file-content').value = '';
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    let kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    return (kb / 1024).toFixed(1) + ' MB';
}

function updateFileInfo(file) {
    const info = document.getElementById('info-box');
    info.innerHTML = `
    <strong>名前:</strong> ${file.name}<br>
    <strong>種類:</strong> ${file.type || 'N/A'}<br>
    <strong>サイズ:</strong> ${formatBytes(file.size)}<br>
    <strong>最終更新:</strong> ${new Date(file.lastModified).toLocaleString()}<br>
  `;
}

async function openFolder() {
    currentDirHandle = await window.showDirectoryPicker();
    parentHandles = [];
    await loadFileHandles();
    renderFileList();
}

async function goUp() {
    if (parentHandles.length === 0) {
        alert('これ以上上のフォルダはありません');
        return;
    }
    currentDirHandle = parentHandles.pop();
    await loadFileHandles();
    renderFileList();
}

async function loadFileHandles() {
    fileHandles = [];
    for await (const entry of currentDirHandle.values()) {
        fileHandles.push(entry);
    }
}

function sortAndRender() {
    const sort = document.getElementById('sort-select').value;
    fileHandles.sort(async (a, b) => {
        let cmp = 0;
        if (sort === 'name') {
            cmp = a.name.localeCompare(b.name);
        } else {
            const af = await a.getFile();
            const bf = await b.getFile();
            cmp = af.lastModified - bf.lastModified;
        }
        return sortAscending ? cmp : -cmp;
    });
    renderFileList();
}

function toggleSortOrder() {
    sortAscending = !sortAscending;
    sortAndRender();
}

function filterFiles() {
    const query = document.getElementById('search-box').value.toLowerCase();
    renderFileList(query);
}

async function renderFileList(filter = '') {
    const listDiv = document.getElementById('file-list');
    listDiv.innerHTML = '';
    hideAllPreviews();
    const ul = document.createElement('ul');
    listDiv.appendChild(ul);

    for (const handle of fileHandles) {
        if (filter && !handle.name.toLowerCase().includes(filter)) continue;
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '0.5rem';

        if (handle.kind === 'directory') {
            li.innerHTML = `<span>📁</span><span>${handle.name}</span>`;
            li.onclick = async () => {
                parentHandles.push(currentDirHandle);
                currentDirHandle = handle;
                await loadFileHandles();
                renderFileList();
            };
        } else {
            const file = await handle.getFile();
            const ext = file.name.toLowerCase();
            let icon = '📄';
            if (ext.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
                icon = `<img class="thumb" src="${URL.createObjectURL(file)}">`;
            } else if (ext.endsWith('.pdf')) {
                icon = '📕';
            } else if (ext.endsWith('.html') || ext.endsWith('.htm')) {
                icon = '🌐';
            }
            li.innerHTML = `<span>${icon}</span><span>${file.name}</span>`;

            li.onclick = (e) => {
                e.stopPropagation();
                openFile(handle);
            };
            li.ondblclick = () => {
                const url = URL.createObjectURL(file);
                window.open(url, '_blank');
            };
            li.oncontextmenu = (e) => {
                e.preventDefault();
                const newName = prompt('新しいファイル名:', handle.name);
                if (newName && newName !== handle.name) {
                    renameFile(handle, newName);
                }
            };
        }
        ul.appendChild(li);
    }
}

async function openFile(fileHandle) {
    currentFileHandle = fileHandle;
    const file = await fileHandle.getFile();
    hideAllPreviews();
    updateFileInfo(file);
    const name = file.name.toLowerCase();

    if (name.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        const url = URL.createObjectURL(file);
        const img = document.getElementById('image-preview');
        img.src = url;
        img.style.display = 'block';
    } else if (name.endsWith('.pdf')) {
        const url = URL.createObjectURL(file);
        const iframe = document.getElementById('pdf-preview');
        iframe.src = url;
        iframe.style.display = 'block';
    } else {
        const text = await file.text();
        const textarea = document.getElementById('file-content');
        textarea.value = text;
        textarea.style.display = 'block';
    }
}

async function saveFile() {
    if (!currentFileHandle) {
        alert('テキストファイルを開いてください');
        return;
    }
    const textarea = document.getElementById('file-content');
    if (textarea.style.display === 'none') {
        alert('画像やPDFは保存できません');
        return;
    }
    const writable = await currentFileHandle.createWritable();
    await writable.write(textarea.value);
    await writable.close();
    alert('保存しました');
}

async function renameFile(fileHandle, newName) {
    const file = await fileHandle.getFile();
    const contents = await file.arrayBuffer();
    const newFileHandle = await currentDirHandle.getFileHandle(newName, { create: true });
    const writable = await newFileHandle.createWritable();
    await writable.write(contents);
    await writable.close();
    await currentDirHandle.removeEntry(fileHandle.name);
    await loadFileHandles();
    renderFileList();
}

async function handleDrop(event) {
    event.preventDefault();
    const items = event.dataTransfer.items;
    for (let item of items) {
        if (item.kind === 'file') {
            const file = item.getAsFile();
            const handle = await currentDirHandle.getFileHandle(file.name, { create: true });
            const writable = await handle.createWritable();
            await writable.write(file);
            await writable.close();
        }
    }
    await loadFileHandles();
    renderFileList();
}

async function downloadZip() {
    if (!currentDirHandle) {
        alert('最初にフォルダを開いてください');
        return;
    }
    const zip = new JSZip();
    await addToZip(currentDirHandle, zip);

    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'folder.zip';
    a.click();
}

async function addToZip(dirHandle, zipFolder) {
    for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === 'file') {
            const file = await handle.getFile();
            zipFolder.file(name, file);
        } else if (handle.kind === 'directory') {
            const newFolder = zipFolder.folder(name);
            await addToZip(handle, newFolder);
        }
    }
}
