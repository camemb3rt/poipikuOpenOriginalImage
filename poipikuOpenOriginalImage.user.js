// ==UserScript==
// @name         poipikuOpenOriginalImage
// @namespace    https://github.com/camemb3rt/poipikuOpenOriginalImage/
// @version      0.1.0
// @description  Open and download the original images on Poipiku.
// @author       camemb3rt
// @match        https://poipiku.com/*
// @grant        GM_xmlhttpRequest
// @connect      cdn.poipiku.com
// @downloadURL  https://github.com/camemb3rt/poipikuOpenOriginalImage/raw/main/poipikuOpenOriginalImage.user.js
// @updateURL    https://github.com/camemb3rt/poipikuOpenOriginalImage/raw/main/poipikuOpenOriginalImage.user.js
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const state = { images: [], index: 0, size: 'fit-height', background: 'black', artist: '', userId: '', postId: '' };
    let overlay;

    function getExtension(url) {
        const name = new URL(url).pathname.split('/').pop() || '';
        const match = name.match(/\.[a-z0-9]+$/i);
        return match ? match[0] : '.png';
    }

    function getFilename(url, index) {
        return `${state.artist}-${state.userId}_${state.postId}-img${index + 1}${getExtension(url)}`;
    }

    function responseBlob(response) {
        const type = response.responseHeaders?.match(/content-type:\s*([^;\r\n]+)/i)?.[1] || 'application/octet-stream';
        return new Blob([response.response], { type });
    }

    async function fetchImage(url) {
        if (typeof GM_xmlhttpRequest === 'function') {
            return new Promise((resolve, reject) => GM_xmlhttpRequest({
                method: 'GET', url, responseType: 'arraybuffer',
                onload: (response) => response.status >= 200 && response.status < 300 ? resolve(responseBlob(response)) : reject(new Error(`Download failed: ${response.status}`)),
                onerror: reject
            }));
        }
        if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') {
            const response = await GM.xmlHttpRequest({ method: 'GET', url, responseType: 'arraybuffer' });
            return responseBlob(response);
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);
        return response.blob();
    }

    async function download(url, index) {
        const name = getFilename(url, index);
        const blob = await fetchImage(url);
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = name;
        document.documentElement.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    }

    async function downloadAll() {
        for (let index = 0; index < state.images.length; index += 1) {
            await download(state.images[index], index);
            await new Promise((resolve) => setTimeout(resolve, 750));
        }
    }

    function imageUrls(html) {
        const page = new DOMParser().parseFromString(html, 'text/html');
        return [...page.querySelectorAll('img')]
            .map((image) => image.currentSrc || image.src)
            .filter((url) => /cdn\.poipiku\.com\/(?!assets\/)/.test(url));
    }

    function styleImage(image) {
        image.style.maxWidth = 'none';
        image.style.maxHeight = 'none';
        image.style.width = 'auto';
        image.style.height = 'auto';
        if (state.size === 'fit-height') image.style.maxHeight = 'calc(100vh - 35px)';
        if (state.size === 'fit-width') image.style.maxWidth = '100vw';
        if (state.size === 'fit-window') {
            image.style.maxWidth = '100vw';
            image.style.maxHeight = 'calc(100vh - 35px)';
        }
    }

    function render() {
        if (!overlay) return;
        overlay.querySelectorAll('.poipiku-original-image').forEach((image, index) => {
            image.alt = getFilename(state.images[index], index);
            image.style.outline = index === state.index ? '3px solid #1da1f2' : '3px solid transparent';
            image.style.outlineOffset = '-3px';
            styleImage(image);
        });
        overlay.style.background = state.background;
        overlay.querySelector('.poipiku-original-help').textContent =
            `[j]next [k]previous [d]download [a]download-all [s]size:${state.size} [b]bgcolor:${state.background} [Esc]close (${state.index + 1}/${state.images.length})`;
    }

    function close() {
        if (overlay) overlay.remove();
        overlay = null;
    }

    function open(urls, post) {
        state.images = [...new Set(urls)];
        state.index = 0;
        state.artist = post.artist;
        state.userId = post.userId;
        state.postId = post.postId;
        if (!state.images.length) return false;
        close();
        overlay = document.createElement('div');
        overlay.id = 'poipiku-original-image-overlay';
        overlay.innerHTML = '<div class="poipiku-original-help"></div><div class="poipiku-original-images"></div>';
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', zIndex: '2147483647', overflow: 'auto', textAlign: 'center', background: state.background
        });
        Object.assign(overlay.querySelector('.poipiku-original-help').style, {
            position: 'sticky', top: '0', zIndex: '1', minHeight: '26px', boxSizing: 'border-box', padding: '4px 8px', color: '#fff', background: '#1b2b3a', textAlign: 'left', font: '14px Arial, sans-serif'
        });
        const images = overlay.querySelector('.poipiku-original-images');
        state.images.forEach((url, index) => {
            const image = document.createElement('img');
            image.className = 'poipiku-original-image';
            image.src = url;
            image.dataset.index = index;
            Object.assign(image.style, { display: 'block', margin: '0 auto 8px', cursor: 'pointer' });
            image.addEventListener('click', () => {
                state.index = index;
                render();
                image.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
            images.appendChild(image);
        });
        overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
        overlay.addEventListener('scroll', () => {
            const image = [...overlay.querySelectorAll('.poipiku-original-image')].reduce((nearest, candidate) =>
                Math.abs(candidate.getBoundingClientRect().top - 30) < Math.abs(nearest.getBoundingClientRect().top - 30) ? candidate : nearest
            );
            if (!image || Number(image.dataset.index) === state.index) return;
            state.index = Number(image.dataset.index);
            render();
        });
        document.documentElement.appendChild(overlay);
        render();
        return true;
    }

    async function openFromPost(trigger) {
        const call = trigger.getAttribute('onclick') || '';
        const match = call.match(/showIllustDetail\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(-?\d+)\s*\)/);
        if (!match) return false;
        const item = document.getElementById(`IllustItem_${match[2]}`);
        const password = item?.querySelector('.IllustItemExpandPass')?.value?.trim() || '';
        const body = new URLSearchParams({ ID: match[1], TD: match[2], AD: match[3], PAS: password });
        const response = await fetch('/f/ShowIllustDetailF.jsp', { method: 'POST', body, credentials: 'same-origin' });
        const data = await response.json();
        const artist = (item?.querySelector('.IllustItemUserName')?.textContent || 'artist').trim().replace(/[\\/:*?"<>|]/g, '_');
        return data.result === 1 && open(imageUrls(data.html), { artist, userId: match[1], postId: match[2] });
    }

    document.addEventListener('click', async (event) => {
        const trigger = event.target.closest?.('a.IllustItemThumb[onclick*="showIllustDetail"]');
        if (!trigger || event.defaultPrevented) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
            if (!await openFromPost(trigger)) trigger.onclick?.();
        } catch (_) {
            trigger.onclick?.();
        }
    }, true);

    document.addEventListener('keydown', (event) => {
        if (!overlay || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
        const key = event.key.toLowerCase();
        if (!['j', 'k', 'd', 'a', 's', 'b', 'escape'].includes(key)) return;
        event.preventDefault();
        if (key === 'escape') return close();
        if (key === 'j') state.index = (state.index + 1) % state.images.length;
        if (key === 'k') state.index = (state.index - 1 + state.images.length) % state.images.length;
        if (key === 'd') return download(state.images[state.index], state.index).catch((error) => console.error('poipikuOpenOriginalImage:', error));
        if (key === 'a') return downloadAll().catch((error) => console.error('poipikuOpenOriginalImage:', error));
        if (key === 'j' || key === 'k') overlay.querySelector(`.poipiku-original-image[data-index="${state.index}"]`).scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (key === 's') state.size = { 'fit-height': 'fit-width', 'fit-width': 'fit-window', 'fit-window': 'full', full: 'fit-height' }[state.size];
        if (key === 'b') state.background = state.background === 'black' ? 'white' : 'black';
        render();
    }, true);
})();

