// ==UserScript==
// @name         无印豆包 - 素材提取
// @namespace    http://tampermonkey.net/
// @version      1.0.5
// @description  在豆包对话页面提取无水印图片/视频，支持一键下载
// @description:en Extract watermark-free images/videos from Doubao chat pages with one-click download
// @author       无印豆包
// @homepage     https://github.com/ihmily/doubao-nomark
// @supportURL   https://github.com/ihmily/doubao-nomark/issues
// @updateURL    https://github.com/ihmily/doubao-nomark/raw/main/doubao-nomark.user.js
// @downloadURL  https://github.com/ihmily/doubao-nomark/raw/main/doubao-nomark.user.js
// @match        https://www.doubao.com/thread/*
// @match        https://www.doubao.com/chat/*
// @match        https://www.qianwen.com/chat/*
// @match        https://www.qianwen.com/share/chat/*
// @grant        none
// @license      MIT
// @run-at       document-end
// @icon         data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>📷</text></svg>
// ==/UserScript==

(function() {
    'use strict';

    console.log('%c[无印豆包] 脚本开始执行', 'color: #667eea; font-size: 14px; font-weight: bold');
    console.log('[无印豆包] 当前 URL:', window.location.href);

    let chatImages = [];
    let chatVideos = [];
    let floatingBtnElement = null;

    function updateButtonCount() {
        if (!floatingBtnElement) return;
        const countElement = floatingBtnElement.querySelector('.count');
        if (!countElement) return;
        const imgCount = chatImages.length;
        countElement.textContent = imgCount + chatVideos.length;
    }

    function addChatVideo(videoInfo) {
        if (!videoInfo || !videoInfo.url) return;
        if (chatVideos.find(v => v.vid === videoInfo.vid || v.url === videoInfo.url)) return;
        chatVideos.push(videoInfo);
        console.log('[无印豆包] 获取到新视频:', videoInfo.vid, videoInfo.url);
        updateButtonCount();
    }

    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._url = url;
        // console.log('[无印豆包] XHR open:', method, url);
        return originalXHROpen.apply(this, [method, url, ...args]);
    };
    
    XMLHttpRequest.prototype.send = function(...args) {
        const url = this._url;
        this.addEventListener('load', function() {
            if (url && (url.includes('/im/chain/single'))) {
                try {
                    const data = JSON.parse(this.responseText);
                    // console.log('[无印豆包] XHR 拦截到聊天接口数据:', data);
                    // console.log('[无印豆包] downlink_body 存在:', !!data?.downlink_body);
                    // console.log('[无印豆包] pull_singe_chain_downlink_body 存在:', !!data?.downlink_body?.pull_singe_chain_downlink_body);
                    // console.log('[无印豆包] messages 存在:', !!data?.downlink_body?.pull_singe_chain_downlink_body?.messages);
                    
                    const messages = data?.downlink_body?.pull_singe_chain_downlink_body?.messages;
                    if (messages && Array.isArray(messages)) {
                        console.log('[无印豆包] 开始解析 messages，数量:', messages.length);
                        parseChatHistoryImages(messages);
                    } else {
                        console.warn('[无印豆包] messages 不是数组或不存在');
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
        const url = args[0];

        if (url && (typeof url === 'string') && url.includes('qianwen.com/api/v1/session/msg/list')) {
            console.log('[无印豆包] 检测到千问 session msg list 请求:', url);
            const response = await originalFetch.apply(this, args);
            response.clone().json().then(data => {
                const chats = data.data?.list || [];
                for (const chat of chats) {
                    const messages = chat?.response_messages || [];
                    parseQianwenMessages(messages);
                }
            }).catch(() => {});
            return response;
        }

        if (url && (typeof url === 'string') && url.includes('qianwen.com/api/v1/share/info')) {
            console.log('[无印豆包] 检测到千问 share chat 请求:', url);
            const response = await originalFetch.apply(this, args);
            response.clone().json().then(data => {
                const chats = data.data.session?.record_list || [];
                for (const chat of chats) {
                    const messages = chat?.response_messages || [];
                    parseQianwenMessages(messages);
                }
            }).catch(() => {});
            return response;
        }

        if (url && (typeof url === 'string') && url.includes('qianwen.com/api/v1/chat/snap')) {
            console.log('[无印豆包] 检测到千问 EventStream 请求:', url);
            
            const response = await originalFetch.apply(this, args);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            const stream = new ReadableStream({
                async start(controller) {
                    let buffer = '';
                    let waitingForData = false;
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        
                        const lines = buffer.split('\n');
                        buffer = lines.pop();
                        
                        for (const line of lines) {
                            if (line.trimEnd() === 'event:complete') {
                                waitingForData = true;
                            } else if (waitingForData && line.startsWith('data:')) {
                                waitingForData = false;
                                try {
                                    const jsonStr = line.substring(5).trim();
                                    const data = JSON.parse(jsonStr);
                                    parseQianwenMessages(data?.data?.messages);
                                } catch (e) {
                                    console.warn('[无印豆包][千问] data 行解析失败:', e.message);
                                }
                            } else if (line.trim() === '') {
                                waitingForData = false;
                            }
                        }
                        
                        controller.enqueue(value);
                    }
                    controller.close();
                }
            });
            
            return new Response(stream, {
                headers: response.headers,
                status: response.status,
                statusText: response.statusText
            });
        }
        
        if (url && url.includes('/chat/completion')) {
            console.log('[无印豆包] ✨ 检测到 EventStream 请求:', url);
            
            const response = await originalFetch.apply(this, args);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            const stream = new ReadableStream({
                async start(controller) {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        const chunk = decoder.decode(value, { stream: true });
                        // console.log('[无印豆包] 收到数据块:', chunk.substring(0, 100));
                        
                        const lines = chunk.split('\n');
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                try {
                                    const jsonStr = line.substring(6);
                                    if (jsonStr.includes('image_ori')) {
                                        const data = JSON.parse(jsonStr);
                                        if (data.event_data || data.patch_op) {
                                            parseStreamChunk(data);
                                        }
                                    }
                                } catch (e) {
                                    console.log('[无印豆包] 解析行失败:', e.message);
                                }
                            }
                        }
                        
                        // 传递数据给原始响应
                        controller.enqueue(value);
                    }
                    controller.close();
                }
            });
            
            return new Response(stream, {
                headers: response.headers,
                status: response.status,
                statusText: response.statusText
            });
        }
        
        return originalFetch.apply(this, args);
    };
    
    console.log('[无印豆包] Fetch 拦截已安装');

    function parseQianwenMessages(messages) {
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
                    const { url, width = 0, height = 0 } = imageObj;
                    if (!chatImages.find(img => img.url === url)) {
                        chatImages.push({ url, width, height });
                        console.log('[无印豆包][千问] 获取到图片:', url, `${width} × ${height}`);
                        updateButtonCount();
                    }
                }
            }
        }
    }

    function parseStreamChunk(data) {
        try {
            if (!data.event_data && !data.patch_op) {
                return;
            }

            let creations = [];

            if (data.patch_op) {

                for (const op of data.patch_op) {
                    if (
                        op.patch_value &&
                        Array.isArray(op.patch_value.content_block)
                    ) {
                        for (const block of op.patch_value.content_block) {
                            if (
                                block?.content?.creation_block &&
                                Array.isArray(block.content.creation_block.creations)
                            ) {
                                creations = block.content.creation_block.creations;
                                break;
                            }
                        }
                    }
                }

                if (creations.length === 0) {
                    const extPatch = data.patch_op.find(op =>
                        op.patch_value &&
                        typeof op.patch_value === 'object' &&
                        op.patch_value.ext?.creation_full_content
                    );

                    if (extPatch) {
                        try {
                            const creationFullContent = extPatch.patch_value.ext.creation_full_content;
                            const creationFullContent_obj = JSON.parse(creationFullContent);

                            for (const item of creationFullContent_obj) {
                                const content = item?.BlockInfo?.BlockContent?.content;
                                if (
                                    content &&
                                    typeof content === 'object' &&
                                    content.creation_block &&
                                    Array.isArray(content.creation_block.creations)
                                ) {
                                    creations = content.creation_block.creations;
                                    break;
                                }
                            }
                        } catch (e) {
                            console.warn('Failed to parse creation_full_content:', e);
                        }
                    }
                }

            }else{
                let eventData;
                try {
                    eventData = JSON.parse(data.event_data);
                } catch (e) {
                    console.log('[无印豆包] 解析 event_data 失败:', e);
                    return;
                }
                
                if (!eventData.message?.content) {
                    return;
                }
                
                let messageContent;
                try {
                    messageContent = JSON.parse(eventData.message.content);
                } catch (e) {
                    console.log('[无印豆包] 解析 message.content 失败:', e);
                    return;
                }
                if (!messageContent.creations || !Array.isArray(messageContent.creations)) {
                    return;
                }

                creations = messageContent.creations;
            }
            

            
            for (const creation of creations) {
                if (creation?.video) {
                    // Handle video
                    const vid = creation.video.vid;
                    getDoubaoVideoInfo(vid).then(info => addChatVideo(info));
                }else{
                    const imageData = creation.image?.image_ori_raw;
                    if (imageData) {
                        let imageUrl = '';
                        let width = 0;
                        let height = 0;
                        
                        if (typeof imageData === 'string') {
                            imageUrl = imageData;
                        } else if (typeof imageData === 'object' && imageData.url) {
                            imageUrl = imageData.url;
                            width = imageData.width || 0;
                            height = imageData.height || 0;
                        }
                        
                        if (imageUrl && !chatImages.find(img => img.url === imageUrl)) {
                            chatImages.push({ url: imageUrl, width, height });
                            console.log('[无印豆包] 获取到新图片:', imageUrl, `${width} × ${height}`);
                            updateButtonCount();
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[无印豆包] 解析 StreamChunk 失败:', e);
        }
    }

    async function getDoubaoVideoInfo(vid) {
        if (!vid) {
            console.warn('[无印豆包] getDoubaoVideoInfo: vid 为空');
            return null;
        }

        const params = {
            version_code: '20800',
            language: 'zh-CN',
            device_platform: 'web',
            aid: '497858',
            real_aid: '497858',
            pkg_type: 'release_version',
            device_id: '',
            pc_version: '2.51.7',
            region: '',
            sys_region: '',
            samantha_web: '1',
            'use-olympus-account': '1',
            web_tab_id: '',
        };

        const queryString = new URLSearchParams(params).toString();
        const apiUrl = `https://www.doubao.com/samantha/media/get_play_info?${queryString}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'origin': 'https://www.doubao.com',
                },
                body: JSON.stringify({ key: vid }),
            });

            const result = await response.json();

            if (!result || !result.data) {
                console.warn('[无印豆包] API返回数据格式异常，可能链接已失效:', result);
                return null;
            }

            const originalMediaInfo = result.data.original_media_info || {};
            const meta = originalMediaInfo.meta || {};

            const videoInfo = {
                vid: vid,
                width: meta.width || 0,
                height: meta.height || 0,
                definition: meta.definition || '',
                duration: meta.duration || 0,
                codec_type: meta.codec_type || '',
                poster_url: result.data.poster_url || '',
                url: originalMediaInfo.main_url || '',
            };

            console.log('[无印豆包] 获取无水印视频成功:', vid, videoInfo.url);
            return videoInfo;
        } catch (e) {
            console.error('[无印豆包] 获取视频播放信息失败:', e);
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
                                const imageData = creation.image?.image_ori_raw;
                                if (imageData) {
                                    let imageUrl = '';
                                    let width = 0;
                                    let height = 0;
                                    
                                    if (typeof imageData === 'string') {
                                        imageUrl = imageData;
                                    } else if (typeof imageData === 'object' && imageData.url) {
                                        imageUrl = imageData.url;
                                        width = imageData.width || 0;
                                        height = imageData.height || 0;
                                    }
                                    
                                    if (imageUrl && !newImages.find(img => img.url === imageUrl)) {
                                        newImages.push({ url: imageUrl, width, height });
                                        console.log('[无印豆包] 找到图片:', imageUrl, `${width} × ${height}`);
                                    }
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
        
        if (newImages.length > 0) {
            chatImages = newImages;
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
                                                    const imageData = creation.image?.image_ori_raw;
                                                    if (imageData) {
                                                        let imageUrl = '';
                                                        let width = 0;
                                                        let height = 0;
                                                        
                                                        if (typeof imageData === 'string') {
                                                            imageUrl = imageData;
                                                        } else if (typeof imageData === 'object' && imageData.url) {
                                                            imageUrl = imageData.url.replace(/&amp;/g, '&');
                                                            width = imageData.width || 0;
                                                            height = imageData.height || 0;
                                                        }
                                                        
                                                        if (imageUrl && !imageList.find(img => img.url === imageUrl)) {
                                                            imageList.push({
                                                                url: imageUrl,
                                                                width: width,
                                                                height: height
                                                            });
                                                            console.log('[无印豆包] 找到图片:', imageUrl, `${width} × ${height}`);
                                                        }
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
        const button = document.createElement('div');
        button.innerHTML = `
            <style>
                * {
                    box-sizing: border-box;
                }
                
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
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.4);
                    z-index: 10000;
                    display: none;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.2s ease;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                #doubao-nomark-modal.show {
                    display: flex;
                }
                
                .modal-content {
                    background: #ffffff;
                    border-radius: 12px;
                    width: 90%;
                    max-width: 1000px;
                    max-height: 85vh;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
                    animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                
                @keyframes slideUp {
                    from { 
                        transform: translateY(20px); 
                        opacity: 0; 
                    }
                    to { 
                        transform: translateY(0); 
                        opacity: 1; 
                    }
                }
                
                .modal-header {
                    padding: 24px 32px;
                    border-bottom: 1px solid #e0e0e0;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .modal-header h3 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    color: #1f1f1f;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .modal-header .subtitle {
                    font-size: 13px;
                    color: #6b6b6b;
                    margin-top: 4px;
                    font-weight: 400;
                }
                
                .modal-header-left {
                    display: flex;
                    flex-direction: column;
                }
                
                .close-btn {
                    width: 32px;
                    height: 32px;
                    background: transparent;
                    border: 1px solid #e0e0e0;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #6b6b6b;
                    font-size: 20px;
                    transition: all 0.2s ease;
                    line-height: 1;
                }
                
                .close-btn:hover {
                    background: #f7f7f7;
                    border-color: #1f1f1f;
                    color: #1f1f1f;
                }
                
                .modal-body {
                    padding: 24px 32px;
                    overflow-y: auto;
                    flex: 1;
                }
                
                .modal-body::-webkit-scrollbar {
                    width: 6px;
                }
                
                .modal-body::-webkit-scrollbar-track {
                    background: transparent;
                }
                
                .modal-body::-webkit-scrollbar-thumb {
                    background: #d0d0d0;
                    border-radius: 3px;
                }
                
                .modal-body::-webkit-scrollbar-thumb:hover {
                    background: #a0a0a0;
                }
                
                .media-grid {
                    --media-card-width: 220px;
                    --media-preview-height: 220px;
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(var(--media-card-width), var(--media-card-width)));
                    justify-content: start;
                    gap: 16px;
                }

                .media-card {
                    position: relative;
                    border-radius: 8px;
                    overflow: hidden;
                    border: 1px solid #e0e0e0;
                    background: #fafafa;
                    transition: all 0.2s ease;
                    display: flex;
                    flex-direction: column;
                }

                .media-card:hover {
                    border-color: #1f1f1f;
                }

                .media-preview {
                    width: 100%;
                    height: var(--media-preview-height);
                    display: block;
                    background: #000;
                }

                .media-preview video {
                    width: 100%;
                    height: var(--media-preview-height);
                    object-fit: contain;
                    display: block;
                    background: #000;
                }

                .video-meta {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    padding: 8px 10px;
                    font-size: 12px;
                    color: #6b6b6b;
                    background: #ffffff;
                    border-top: 1px solid #f0f0f0;
                }

                .video-meta-item {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }

                .video-actions {
                    display: flex;
                    gap: 8px;
                    padding: 10px;
                    background: #ffffff;
                    border-top: 1px solid #e0e0e0;
                }
                
                .media-preview img {
                    width: 100%;
                    height: var(--media-preview-height);
                    object-fit: cover;
                    display: block;
                }
                
                .image-info {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    padding: 4px 8px;
                    background: rgba(0, 0, 0, 0.6);
                    border-radius: 4px;
                    font-size: 11px;
                    color: #ffffff;
                    font-weight: 500;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                }
                
                .media-card:hover .image-info {
                    opacity: 1;
                }
                
                .action-btn {
                    flex: 1;
                    padding: 6px 12px;
                    border: 1px solid #e0e0e0;
                    border-radius: 4px;
                    background: #ffffff;
                    color: #1f1f1f;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .action-btn:hover {
                    background: #f7f7f7;
                    border-color: #1f1f1f;
                }
                
                .action-btn.success {
                    background: #f0fdf4;
                    border-color: #86efac;
                    color: #166534;
                }
                
                .empty-state {
                    text-align: center;
                    padding: 80px 20px;
                    color: #a0a0a0;
                }
                
                .empty-state-icon {
                    font-size: 48px;
                    margin-bottom: 12px;
                    opacity: 0.5;
                }
                
                .empty-state-text {
                    font-size: 15px;
                    color: #6b6b6b;
                    font-weight: 500;
                }
                
                .empty-state-desc {
                    font-size: 13px;
                    color: #a0a0a0;
                    margin-top: 4px;
                }
                
                .modal-footer {
                    padding: 16px 32px;
                    border-top: 1px solid #e0e0e0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 12px;
                    background: #fafafa;
                }
                
                .footer-divider {
                    width: 1px;
                    height: 12px;
                    background: #e0e0e0;
                }
                
                .footer-text {
                    color: #a0a0a0;
                    font-size: 13px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .footer-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    color: #6b6b6b;
                    text-decoration: none;
                    font-size: 13px;
                    transition: all 0.15s ease;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .footer-link:hover {
                    color: #1f1f1f;
                }
                
                .footer-link svg {
                    width: 16px;
                    height: 16px;
                    opacity: 0.7;
                    transition: opacity 0.15s ease;
                }
                
                .footer-link:hover svg {
                    opacity: 1;
                }
            </style>
            <div id="doubao-nomark-btn" title="提取无水印素材">
                📷
                <span class="count">0</span>
            </div>
            <div id="doubao-nomark-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="modal-header-left">
                            <h3>无水印素材</h3>
                            <div class="subtitle" id="image-subtitle">共 0 张图片</div>
                        </div>
                        <button class="close-btn">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="media-grid" id="media-container"></div>
                    </div>
                    <div class="modal-footer">
                        <a href="https://github.com/ihmily/doubao-nomark" target="_blank" class="footer-link">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                            开源项目
                        </a>
                        <div class="footer-divider"></div>
                        <span class="footer-text">© 2026 无印豆包</span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(button);

        floatingBtnElement = document.getElementById('doubao-nomark-btn');

        const floatingBtn = floatingBtnElement;
        const modal = document.getElementById('doubao-nomark-modal');
        const closeBtn = modal.querySelector('.close-btn');
        const mediaContainer = document.getElementById('media-container');
        const imageSubtitle = document.getElementById('image-subtitle');

        let currentImages = [];
        let currentVideos = [];

        function formatDuration(sec) {
            if (!sec || sec <= 0) return '';
            const s = Math.floor(sec);
            const m = Math.floor(s / 60);
            const r = s % 60;
            return `${m}:${r.toString().padStart(2, '0')}`;
        }

        function updateImageCount() {
            const images = extractImages();
            const videos = extractVideos();
            currentImages = images;
            currentVideos = videos;
            const totalCount = images.length + videos.length;
            floatingBtn.querySelector('.count').textContent = totalCount;
            imageSubtitle.textContent = `共 ${images.length} 张图片 · ${videos.length} 个视频`;
            return { images, videos };
        }

        function renderMedia(images, videos) {
            const mediaItems = [
                ...images.map((image, index) => ({ type: 'image', data: image, index })),
                ...videos.map((video, index) => ({ type: 'video', data: video, index })),
            ];

            if (mediaItems.length === 0) {
                mediaContainer.innerHTML = '';
                return;
            }

            mediaContainer.innerHTML = mediaItems.map((item) => {
                if (item.type === 'image') {
                    const image = item.data;
                    const resolution = (image.width && image.height) ? `${image.width} × ${image.height}` : '';
                    return `
                        <div class="media-card">
                            <div class="media-preview">
                                <img src="${image.url}" alt="图片 ${item.index + 1}" loading="lazy">
                                ${resolution ? `<div class="image-info">${resolution}</div>` : ''}
                            </div>
                            <div class="video-meta">
                                <span class="video-meta-item">🖼 图片</span>
                                ${resolution ? `<span class="video-meta-item">📐 ${resolution}</span>` : ''}
                            </div>
                            <div class="video-actions">
                                <button class="action-btn btn-media-download" data-type="image" data-url="${image.url}" data-index="${item.index}">下载</button>
                                <button class="action-btn btn-media-copy" data-url="${image.url}">复制地址</button>
                            </div>
                        </div>
                    `;
                }

                const video = item.data;
                const resolution = (video.width && video.height) ? `${video.width} × ${video.height}` : '';
                const duration = formatDuration(video.duration);
                const posterAttr = video.poster_url ? ` poster="${video.poster_url}"` : '';
                return `
                    <div class="media-card">
                        <div class="media-preview">
                            <video src="${video.url}" controls preload="none" playsinline${posterAttr}></video>
                        </div>
                        <div class="video-meta">
                            <span class="video-meta-item">🎬 视频</span>
                            ${resolution ? `<span class="video-meta-item">📐 ${resolution}</span>` : ''}
                            ${duration ? `<span class="video-meta-item">⏱ ${duration}</span>` : ''}
                            ${video.definition ? `<span class="video-meta-item">清晰度 ${video.definition}</span>` : ''}
                        </div>
                        <div class="video-actions">
                            <button class="action-btn btn-media-download" data-type="video" data-url="${video.url}" data-index="${item.index}">下载</button>
                            <button class="action-btn btn-media-copy" data-url="${video.url}">复制地址</button>
                        </div>
                    </div>
                `;
            }).join('');

            mediaContainer.querySelectorAll('.btn-media-download').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const type = btn.dataset.type;
                    const url = btn.dataset.url;
                    const index = parseInt(btn.dataset.index, 10) + 1;
                    const filename = type === 'video' ? `doubao_video_${index}.mp4` : `doubao_image_${index}.png`;
                    downloadImage(url, filename);
                    btn.classList.add('success');
                    btn.textContent = '✓ 已下载';
                    setTimeout(() => {
                        btn.classList.remove('success');
                        btn.textContent = '下载';
                    }, 2000);
                });
            });

            mediaContainer.querySelectorAll('.btn-media-copy').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const url = btn.dataset.url;
                    try {
                        await navigator.clipboard.writeText(url);
                        btn.classList.add('success');
                        btn.textContent = '✓ 已复制';
                        setTimeout(() => {
                            btn.classList.remove('success');
                            btn.textContent = '复制地址';
                        }, 2000);
                    } catch (err) {
                        console.error('复制失败:', err);
                    }
                });
            });
        }

        floatingBtn.addEventListener('click', () => {
            const { images, videos } = updateImageCount();

            if (images.length === 0 && videos.length === 0) {
                mediaContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🖼️</div>
                        <div class="empty-state-text">当前页面没有找到图片或视频</div>
                    </div>
                `;
            } else {
                renderMedia(images, videos);
            }

            modal.classList.add('show');
        });

        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });

        updateImageCount();
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
