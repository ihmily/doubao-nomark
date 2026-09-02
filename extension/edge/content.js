(function() {
    'use strict';

    const URL_PATTERNS = Object.freeze({
        QIANWEN_SESSION_LIST: 'qianwen.com/api/v1/session/msg/list',
        QIANWEN_SHARE_INFO: 'qianwen.com/api/v1/share/info',
        QIANWEN_SNAP: 'qianwen.com/api/v1/chat/snap',
        DOUBAO_COMPLETION: '/chat/completion',
        DOUBAO_CHAIN: '/im/chain/single'
    });
    const PLATFORM_CODE = window.location.hostname.includes('qianwen.com') ? 'Q' : 'D';

    function getRequestUrl(input) {
        if (typeof input === 'string') return input;
        if (input && typeof input.url === 'string') return input.url;
        return '';
    }

    function hasUrl(url, pattern) {
        return typeof url === 'string' && url.includes(pattern);
    }

    function observeJson(response, handler) {
        response.clone().json().then(handler).catch(() => {});
    }

    function createPassthroughResponse(response, onChunk, onComplete) {
        if (!response.body) return response;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        onChunk(decoder.decode(value, { stream: true }));
                        controller.enqueue(value);
                    }
                    const trailingChunk = decoder.decode();
                    if (trailingChunk) onChunk(trailingChunk);
                    onComplete?.();
                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            }
        });
        return new Response(stream, {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText
        });
    }

    function getStableValue(value) {
        return value === undefined || value === null ? '' : String(value).trim();
    }

    function getUrlIdentity(url) {
        const value = getStableValue(url);
        if (!value) return '';
        const queryStart = value.search(/[?#]/);
        return queryStart === -1 ? value : value.slice(0, queryStart);
    }

    function isSameUrl(left, right) {
        const leftIdentity = getUrlIdentity(left);
        const rightIdentity = getUrlIdentity(right);
        return Boolean(leftIdentity && leftIdentity === rightIdentity);
    }

    function isSameImage(left, right) {
        const leftKey = getStableValue(left?.key);
        const rightKey = getStableValue(right?.key);
        if (leftKey || rightKey) return Boolean(leftKey && rightKey && leftKey === rightKey);
        return isSameUrl(left?.url, right?.url);
    }

    function isSameVideo(left, right) {
        const leftVid = getStableValue(left?.vid);
        const rightVid = getStableValue(right?.vid);
        if (leftVid || rightVid) {
            if (leftVid && rightVid) return leftVid === rightVid;
            return isSameUrl(left?.url, right?.url);
        }
        return isSameUrl(left?.url, right?.url);
    }

    // Signed image URLs can change between requests. Keep one item per image key
    // while refreshing its URL and metadata when the service returns a newer copy.
    function addUniqueImage(image, target = chatImages, prepend = false) {
        if (!image?.url) return false;
        const existing = target.find(item => isSameImage(item, image));
        if (!existing) {
            if (prepend) target.unshift(image);
            else target.push(image);
            return true;
        }

        const changed = Boolean(existing.url !== image.url
            || (!existing.key && image.key)
            || (image.width > 0 && existing.width !== image.width)
            || (image.height > 0 && existing.height !== image.height));
        if (changed) {
            existing.url = image.url;
            if (!existing.key && image.key) existing.key = image.key;
            if (image.width > 0) existing.width = image.width;
            if (image.height > 0) existing.height = image.height;
        }
        return changed;
    }

    function normalizeImageData(imageData, decodeAmp = false, stableKey = '') {
        if (typeof imageData === 'string') return { url: imageData, key: '', width: 0, height: 0 };
        if (!imageData || typeof imageData !== 'object' || !imageData.url) return null;
        const url = decodeAmp ? imageData.url.replace(/&amp;/g, '&') : imageData.url;
        return {
            url,
            key: getStableValue(stableKey || imageData.key),
            width: imageData.width || 0,
            height: imageData.height || 0
        };
    }

    console.log('%c[无印豆包] 脚本开始执行', 'color: #667eea; font-size: 14px; font-weight: bold');
    console.log('[无印豆包] 当前 URL:', window.location.href);

    let chatImages = [];
    let chatVideos = [];
    let floatingBtnElement = null;
    let panelMediaSync = null;
    let mediaScope = getMediaScope();

    function getMediaScope() {
        return `${window.location.hostname}${window.location.pathname}`;
    }

    function resetMediaForScopeChange() {
        const nextScope = getMediaScope();
        if (nextScope === mediaScope) return false;
        mediaScope = nextScope;
        chatImages = [];
        chatVideos = [];
        updateButtonCount();
        return true;
    }

    function notifyPanelMediaChanged() {
        panelMediaSync?.();
    }

    function updateButtonCount() {
        if (!floatingBtnElement) return;
        const countElement = floatingBtnElement.querySelector('.count');
        if (!countElement) return;
        countElement.textContent = chatImages.length + chatVideos.length;
        notifyPanelMediaChanged();
    }

    function addChatVideo(videoInfo) {
        if (!videoInfo || !videoInfo.url) return;
        const existing = chatVideos.find(video => isSameVideo(video, videoInfo));
        if (!existing) {
            chatVideos.push(videoInfo);
            console.log('[无印豆包] 获取到新视频:', videoInfo.vid, videoInfo.url);
            updateButtonCount();
            return true;
        }

        const changed = Boolean(existing.url !== videoInfo.url
            || (!existing.vid && videoInfo.vid)
            || (videoInfo.poster_url && existing.poster_url !== videoInfo.poster_url)
            || (videoInfo.width > 0 && existing.width !== videoInfo.width)
            || (videoInfo.height > 0 && existing.height !== videoInfo.height)
            || (videoInfo.duration > 0 && existing.duration !== videoInfo.duration)
            || (videoInfo.definition && existing.definition !== videoInfo.definition)
            || (videoInfo.codec_type && existing.codec_type !== videoInfo.codec_type));
        if (changed) {
            existing.url = videoInfo.url;
            if (!existing.vid && videoInfo.vid) existing.vid = videoInfo.vid;
            if (videoInfo.poster_url) existing.poster_url = videoInfo.poster_url;
            if (videoInfo.width > 0) existing.width = videoInfo.width;
            if (videoInfo.height > 0) existing.height = videoInfo.height;
            if (videoInfo.duration > 0) existing.duration = videoInfo.duration;
            if (videoInfo.definition) existing.definition = videoInfo.definition;
            if (videoInfo.codec_type) existing.codec_type = videoInfo.codec_type;
            console.log('[无印豆包] 更新视频地址:', videoInfo.vid, videoInfo.url);
            updateButtonCount();
        }
        return changed;
    }

    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._url = url;
        return originalXHROpen.apply(this, [method, url, ...args]);
    };
    
    XMLHttpRequest.prototype.send = function(...args) {
        const url = this._url;
        this.addEventListener('load', function() {
            if (hasUrl(url, URL_PATTERNS.DOUBAO_CHAIN)) {
                try {
                    const data = JSON.parse(this.responseText);
                    
                    const messages = data?.downlink_body?.pull_singe_chain_downlink_body?.messages;
                    if (messages && Array.isArray(messages)) {
                        resetMediaForScopeChange();
                        console.log('[无印豆包] 开始解析 messages，数量:', messages.length);
                        parseChatHistoryImages(messages);
                    }
                } catch (e) {
                    console.error('[无印豆包] XHR 解析聊天数据失败:', e);
                }
            }
        });
        return originalXHRSend.apply(this, args);
    };
    
    console.log('[无印豆包] XHR 拦截已安装');

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = getRequestUrl(args[0]);
        
        if (hasUrl(url, URL_PATTERNS.QIANWEN_SESSION_LIST)) {
            console.log('[无印豆包] 检测到千问 session msg list 请求:', url);
            const response = await originalFetch.apply(this, args);
            observeJson(response, data => {
                const chats = data.data?.list || [];
                for (const chat of chats) {
                    const messages = chat?.response_messages || [];
                    parseQianwenMessages(messages);
                }
            }).catch(() => {});
            return response;
        }

        if (hasUrl(url, URL_PATTERNS.QIANWEN_SHARE_INFO)) {
            console.log('[无印豆包] 检测到千问 share chat 请求:', url);
            const response = await originalFetch.apply(this, args);
            observeJson(response, data => {
                const chats = data.data.session?.record_list || [];
                for (const chat of chats) {
                    const messages = chat?.response_messages || [];
                    parseQianwenMessages(messages);
                }
            }).catch(() => {});
            return response;
        }

        if (hasUrl(url, URL_PATTERNS.QIANWEN_SNAP)) {
            console.log('[无印豆包] 检测到千问 EventStream 请求:', url);
            
            const response = await originalFetch.apply(this, args);
            let buffer = '';
            let waitingForData = false;
            return createPassthroughResponse(response, chunk => {
                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (line.trimEnd() === 'event:complete') {
                        waitingForData = true;
                    } else if (waitingForData && line.startsWith('data:')) {
                        waitingForData = false;
                        try {
                            const data = JSON.parse(line.substring(5).trim());
                            parseQianwenMessages(data?.data?.messages, true);
                        } catch (error) {
                            console.warn('[无印豆包][千问] data 行解析失败:', error.message);
                        }
                    } else if (line.trim() === '') {
                        waitingForData = false;
                    }
                }
            });
        }
        
        if (hasUrl(url, URL_PATTERNS.DOUBAO_COMPLETION)) {
            console.log('[无印豆包] 检测到 EventStream 请求:', url);
            
            const response = await originalFetch.apply(this, args);
            let buffer = '';
            const processLine = line => {
                if (!line.startsWith('data: ')) return;
                try {
                    const jsonStr = line.substring(6);
                    if (!jsonStr.includes('image_ori')) return;
                    const data = JSON.parse(jsonStr);
                    if (data.event_data || data.patch_op) parseStreamChunk(data);
                } catch (error) {
                    console.log('[无印豆包] 解析行失败:', error.message);
                    console.log('[无印豆包] 解析行失败:', line);
                }
            };
            return createPassthroughResponse(response, chunk => {
                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                lines.forEach(processLine);
            }, () => {
                if (buffer) processLine(buffer);
            });
        }
        
        return originalFetch.apply(this, args);
    };
    
    console.log('[无印豆包] Fetch 拦截已安装');

    function parseQianwenMessages(messages, prepend = false) {
        if (!Array.isArray(messages)) {
            return;
        }
        for (const message of messages) {
            if (message?.mime_type !== 'multi_load/iframe') continue;
            const multiLoad = message?.meta_data?.multi_load;
            if (!Array.isArray(multiLoad)) {
                continue;
            }
            for (const item of multiLoad) {
                const displayList = item?.content?.display_list;
                if (!Array.isArray(displayList)) {
                    continue;
                }
                for (const display of displayList) {
                    const imageObj = display?.image?.[0];
                    if (!imageObj?.url) continue;
                    const image = {
                        url: imageObj.url,
                        key: getStableValue(imageObj.key),
                        width: imageObj.width === undefined ? 0 : imageObj.width,
                        height: imageObj.height === undefined ? 0 : imageObj.height
                    };
                    if (addUniqueImage(image, chatImages, prepend)) {
                        console.log('[无印豆包][千问] 获取到图片:', image.url, `${image.width} × ${image.height}`);
                        updateButtonCount();
                    }
                }
            }
        }
    }

    
    function findCreationsInPatch(patchOps) {
        if (!Array.isArray(patchOps)) return [];

        let creations = [];
        for (const op of patchOps) {
            const blocks = op?.patch_value?.content_block;
            if (!Array.isArray(blocks)) continue;
            const block = blocks.find(item => Array.isArray(item?.content?.creation_block?.creations));
            if (block) creations = block.content.creation_block.creations;
        }
        if (creations.length > 0) return creations;

        const extPatch = patchOps.find(op => op?.patch_value?.ext?.creation_full_content);
        if (!extPatch) return [];
        try {
            const content = JSON.parse(extPatch.patch_value.ext.creation_full_content);
            if (!Array.isArray(content)) return [];
            for (const item of content) {
                const creations = item?.BlockInfo?.BlockContent?.content?.creation_block?.creations;
                if (Array.isArray(creations)) return creations;
            }
        } catch (error) {
            console.warn('Failed to parse creation_full_content:', error);
        }
        return [];
    }

    function findCreationsInEventData(rawEventData) {
        let eventData;
        try {
            eventData = JSON.parse(rawEventData);
        } catch (error) {
            console.log('[无印豆包] 解析 event_data 失败:', error);
            return [];
        }
        if (!eventData.message?.content) return [];
        try {
            const content = JSON.parse(eventData.message.content);
            return Array.isArray(content.creations) ? content.creations : [];
        } catch (error) {
            console.log('[无印豆包] 解析 message.content 失败:', error);
            return [];
        }
    }

    function parseStreamChunk(data) {
        try {
            resetMediaForScopeChange();
            if (!data.event_data && !data.patch_op) {
                return;
            }

            const creations = data.patch_op
                ? findCreationsInPatch(data.patch_op)
                : findCreationsInEventData(data.event_data);
            for (const creation of creations) {
                if (creation?.video) {
                    const vid = creation.video.vid;
                    getDoubaoVideoInfo(vid).then(info => addChatVideo(info));
                }else{
                    const image = normalizeImageData(
                        creation.image?.image_ori_raw,
                        false,
                        creation.image?.key
                    );
                    if (addUniqueImage(image, chatImages, true)) {
                        console.log('[无印豆包] 获取到新图片:', image.url, `${image.width} × ${image.height}`);
                        updateButtonCount();
                    }
                }
            }
            
            console.log('[无印豆包][千问] 聊天界面，返回已缓存的', chatImages.length, '张图片');
        } catch (e) {
            console.error('[无印豆包] 解析 StreamChunk 失败:', e);
        }
    }

    // Resolve the creation node first, then request the original download asset.
    async function getDoubaoVideoInfo(vid) {
        if (!vid) return null;

        const postAispace = async (path, body) => {
            const response = await fetch(`https://www.doubao.com/samantha/aispace/${path}`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Accept: 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    Origin: 'https://www.doubao.com',
                    Referer: 'https://www.doubao.com/',
                },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        };

        try {
            const homepage = await postAispace('homepage', {});
            const creation = (homepage?.data?.children || []).find(item => item?.name === '我的创作');
            if (!creation?.id) throw new Error('未找到我的创作空间');

            const nodeInfo = await postAispace('node_info?aid=582478', { node_id: creation.id });
            const node = (nodeInfo?.data?.children || []).find(item => item?.key === vid);
            if (!node?.id) throw new Error(`未找到视频节点: ${vid}`);

            const downloadInfo = await postAispace('get_download_info?aid=582478', {
                requests: [{ node_id: node.id }],
            });
            const infos = downloadInfo?.data?.download_infos;
            const info = Array.isArray(infos) ? infos.find(item => item?.main_url) : null;
            if (!info) throw new Error('响应中没有无水印 main_url');

            const meta = info.meta || info.video_info || {};
            const videoInfo = {
                vid,
                width: meta.width || info.width || 0,
                height: meta.height || info.height || 0,
                definition: meta.definition || info.definition || '',
                duration: meta.duration || info.duration || 0,
                codec_type: meta.codec_type || info.codec_type || '',
                poster_url: info.poster_url || info.cover_url || '',
                url: info.main_url,
            };
            console.log('[无印豆包] 获取无水印视频成功:', vid, videoInfo.url);
            return videoInfo;
        } catch (e) {
            console.error('[无印豆包] 获取无水印视频失败:', vid, e);
            return null;
        }
    }

    function parseChatHistoryImages(messages) {
        if (!Array.isArray(messages)) return;
        
        const newImages = [];

        try {
            for (const item of messages) {
                try {
                    for (const content of item.content_block) {
                        const creationBlock = content.content?.creation_block;
                        if (!creationBlock || !Array.isArray(creationBlock.creations)) continue;
                        for (const creation of creationBlock.creations) {
                            if (creation?.video) {
                                const vid = creation.video.vid;
                                getDoubaoVideoInfo(vid).then(info => addChatVideo(info));
                            }else{
                                const image = normalizeImageData(
                                    creation.image?.image_ori_raw,
                                    false,
                                    creation.image?.key
                                );
                                if (addUniqueImage(image, newImages)) {
                                    console.log('[无印豆包] 找到图片:', image.url, `${image.width} × ${image.height}`);
                                }
                            }
                        }
                    }
                    
                } catch (e) {
                    console.log('[无印豆包] 解析消息失败:', e);
                    continue;
                }
            }
        } catch (e) {
            console.log('[无印豆包] 解析消息失败:', e);
        }
        
        let mediaChanged = false;
        for (const image of newImages) {
            if (addUniqueImage(image)) mediaChanged = true;
        }
        if (mediaChanged) {
            console.log('[无印豆包] 更新聊天图片，共', chatImages.length, '张');
            updateButtonCount();
        }
    }

    function extractSharePageImages() {
        try {
            const imageList = [];
            
            const scriptElement = document.querySelector('script[data-script-src="modern-run-router-data-fn"]');
            if (scriptElement) {
                const dataFnArgs = scriptElement.getAttribute('data-fn-args');
                if (dataFnArgs) {
                    const jsonStr = dataFnArgs.replace(/&quot;/g, '"');
                    const jsonData = JSON.parse(jsonStr);
                    
                    for (const data of jsonData) {
                        if (typeof data === 'object' && data?.data?.message_snapshot?.message_list) {
                            const messageSnapshot = data.data.message_snapshot.message_list;
                            console.log('[无印豆包] 找到消息列表，共', messageSnapshot.length, '条消息');
                            
                            for (const message of messageSnapshot) {
                                for (const block of message.content_block || []) {
                                    try {
                                        const contentData = JSON.parse(block.content_v2);
                                        if (contentData.creation_block?.creations) {
                                            for (const creation of contentData.creation_block.creations) {
                                                if (creation?.video) {
                                                    const vid = creation.video.vid;
                                                    getDoubaoVideoInfo(vid).then(info => addChatVideo(info));
                                                }else{
                                                    const image = normalizeImageData(
                                                        creation.image?.image_ori_raw,
                                                        true,
                                                        creation.image?.key
                                                    );
                                                    if (addUniqueImage(image, imageList)) {
                                                        console.log('[无印豆包] 找到图片:', image.url, `${image.width} × ${image.height}`);
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }
                            }
                        }
                    }
                    
                    console.log('[无印豆包] 提取完成，共找到', imageList.length, '张图片');
                    return imageList;
                }
            }
            
            console.error('[无印豆包] 未找到任何可用的数据源');
            return [];
        } catch (error) {
            console.error('[无印豆包] 提取图片失败:', error);
            return [];
        }
    }

    function extractImages() {
        resetMediaForScopeChange();
        if (window.location.hostname.includes('doubao.com') && window.location.pathname.includes('/chat/')) {
            console.log('[无印豆包] 豆包聊天界面，返回已缓存的', chatImages.length, '张图片');
            return chatImages;
        } else if (window.location.hostname.includes('qianwen.com') && window.location.pathname.includes('/chat/')) {
            return chatImages;
        }else{
            const images = extractSharePageImages();
            chatImages = images;
            console.log('[无印豆包] 豆包分享界面，返回已缓存的', images.length, '张图片');
            return images;
        }
    }

    function extractVideos() {
        console.log('[无印豆包] 当前视频缓存数:', chatVideos.length);
        return chatVideos;
    }

    async function downloadImage(url, filename) {
        try {
            console.log('[无印豆包] 开始下载:', url);
            
            const response = await fetch(url);
            const blob = await response.blob();
            
            const blobUrl = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
            
            console.log('[无印豆包] 下载完成:', filename);
        } catch (error) {
            console.error('[无印豆包] 下载失败:', error);
            alert('下载失败，请重试');
        }
    }

    function createFloatingButton() {
        if (document.getElementById('doubao-nomark-btn')) return;

        const panelUrl = document.documentElement.dataset.doubaoNomarkPanel || '';
        if (!panelUrl) {
            document.documentElement.addEventListener('doubao-nomark-assets-ready', createFloatingButton, { once: true });
            return;
        }
        const button = document.createElement('div');
        button.innerHTML = `
            <style>
                #doubao-nomark-btn {
                    position: fixed;
                    right: 24px;
                    bottom: 24px;
                    z-index: 9999;
                    width: 48px;
                    height: 48px;
                    background: #ffffff;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
                }
                #doubao-nomark-btn:hover {
                    border-color: #1f1f1f;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
                }
                #doubao-nomark-btn .count {
                    position: absolute;
                    top: -6px;
                    right: -6px;
                    min-width: 20px;
                    height: 20px;
                    padding: 0 6px;
                    background: #1f1f1f;
                    color: #ffffff;
                    border-radius: 10px;
                    font-size: 11px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    line-height: 1;
                }
                #doubao-nomark-modal {
                    position: fixed;
                    inset: 0;
                    z-index: 10000;
                    display: none;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.4);
                }
                #doubao-nomark-modal.show { display: flex; }
                #doubao-nomark-panel-frame {
                    width: min(1180px, calc(100vw - 24px));
                    height: min(718px, calc(100vh - 24px));
                    border: 0;
                    border-radius: 22px;
                    background: transparent;
                }
                @media (max-width: 640px) {
                    #doubao-nomark-panel-frame {
                        width: calc(100vw - 12px);
                        height: calc(100vh - 12px);
                        border-radius: 16px;
                    }
                }
            </style>
            <div id="doubao-nomark-btn" title="提取无水印素材">
                📷
                <span class="count">0</span>
            </div>
            <div id="doubao-nomark-modal">
                <iframe id="doubao-nomark-panel-frame" title="无水印素材" src="${panelUrl}" allow="fullscreen"></iframe>
            </div>
        `;

        document.body.appendChild(button);

        floatingBtnElement = document.getElementById('doubao-nomark-btn');
        const floatingBtn = floatingBtnElement;
        const modal = document.getElementById('doubao-nomark-modal');
        const frame = document.getElementById('doubao-nomark-panel-frame');

        function sendMediaToPanel() {
            if (!frame.contentWindow) return;
            frame.contentWindow.postMessage({
                type: 'doubao-nomark-media',
                platform: PLATFORM_CODE,
                images: extractImages(),
                videos: extractVideos()
            }, '*');
        }

        floatingBtn.addEventListener('click', () => {
            updateButtonCount();
            modal.classList.add('show');
        });

        frame.addEventListener('load', sendMediaToPanel);

        modal.addEventListener('click', (event) => {
            if (event.target === modal) modal.classList.remove('show');
        });

        window.addEventListener('message', (event) => {
            if (event.source !== frame.contentWindow || !event.data) return;
            const { type, url, filename } = event.data;
            if (type === 'doubao-nomark-panel-ready') {
                sendMediaToPanel();
            } else if (type === 'doubao-nomark-panel-close') {
                modal.classList.remove('show');
            } else if (type === 'doubao-nomark-download' && url) {
                downloadImage(url, filename || 'doubao_media');
            } else if (type === 'doubao-nomark-copy' && url) {
                navigator.clipboard?.writeText(url).catch(() => {});
            }
        });

        panelMediaSync = sendMediaToPanel;
        updateButtonCount();
    }

    let initRetryCount = 0;
    const MAX_RETRY = 10;

    function initScript() {
        console.log('[无印豆包] 脚本已加载');
        
        if (window.location.pathname.includes('/chat/')) {
            createFloatingButton();
            return;
        }
        
        const hasScriptData = !!document.querySelector('script[data-script-src="modern-run-router-data-fn"]');
        const hasRouterData = !!window._ROUTER_DATA;
        
        if (!hasScriptData && !hasRouterData) {
            initRetryCount++;
            if (initRetryCount < MAX_RETRY) {
                console.warn(`[无印豆包] 页面数据仍未加载，等待中... (${initRetryCount}/${MAX_RETRY})`);
                setTimeout(initScript, 500);
                return;
            } else {
                console.warn('[无印豆包] 页面数据加载超时，仍创建按钮（可能无法提取历史图片）');
            }
        }

        if (window.location.hostname.includes('doubao.com') && window.location.pathname.includes('/thread/')) {
            chatImages = extractSharePageImages();
        }
        
        createFloatingButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScript);
    } else if (document.readyState === 'interactive') {
        if (document.body) {
            initScript();
        } else {
            document.addEventListener('DOMContentLoaded', initScript);
        }
    } else {
        initScript();
    }

})();
