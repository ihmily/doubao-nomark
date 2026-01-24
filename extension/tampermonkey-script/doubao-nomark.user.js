// ==UserScript==
// @name         无印豆包 - 图片提取
// @namespace    http://tampermonkey.net/
// @version      1.0.2
// @description  在豆包对话页面提取无水印图片
// @description:en Extract watermark-free images from Doubao chat pages with one-click download
// @author       无印豆包
// @homepage     https://github.com/ihmily/doubao-nomark
// @supportURL   https://github.com/ihmily/doubao-nomark/issues
// @updateURL    https://github.com/ihmily/doubao-nomark/raw/main/doubao-nomark.user.js
// @downloadURL  https://github.com/ihmily/doubao-nomark/raw/main/doubao-nomark.user.js
// @match        https://www.doubao.com/thread/*
// @match        https://www.doubao.com/chat/*
// @grant        none
// @license      MIT
// @run-at       document-end
// @icon         data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>📷</text></svg>
// ==/UserScript==

(function() {
    'use strict';

    console.log('%c[无印豆包] 脚本开始执行', 'color: #667eea; font-size: 14px; font-weight: bold');
    console.log('[无印豆包] 当前 URL:', window.location.href);
    console.log('[无印豆包] document.readyState:', document.readyState);

    let chatImages = [];
    let floatingBtnElement = null;

    function updateButtonCount() {
        if (floatingBtnElement && window.location.pathname.includes('/chat/')) {
            const countElement = floatingBtnElement.querySelector('.count');
            if (countElement) {
                countElement.textContent = chatImages.length;
            }
        }
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
                        parseChatImages(messages);
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
        // console.log('[无印豆包] Fetch 请求:', url);
        
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
                                    const data = JSON.parse(jsonStr);
                                    if (data.event_data) {
                                        parseStreamChunk(data);
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

    function parseStreamChunk(data) {
        try {
            if (!data.event_data) {
                return;
            }
            
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
            
            for (const creation of messageContent.creations) {
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
        } catch (e) {
            console.error('[无印豆包] 解析 StreamChunk 失败:', e);
        }
    }

    function parseChatImages(messages) {
        if (!Array.isArray(messages)) return;
        
        const newImages = [];
        
        for (const msg of messages) {
            const contentStr = msg.content;
            if (!contentStr || typeof contentStr !== 'string') continue;
            
            try {
                const contentArray = JSON.parse(contentStr);
                if (!Array.isArray(contentArray)) continue;
                
                for (const item of contentArray) {
                    const creationBlock = item?.content?.creation_block;
                    if (!creationBlock?.creations) continue;
                    
                    for (const creation of creationBlock.creations) {
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
            } catch (e) {
                console.log('[无印豆包] 解析消息失败:', e);
                continue;
            }
        }
        
        if (newImages.length > 0) {
            chatImages = newImages;
            console.log('[无印豆包] 更新聊天图片，共', chatImages.length, '张');
            updateButtonCount();
        }
    }

    function extractImages() {
        
        if (window.location.pathname.includes('/chat/')) {
            console.log('[无印豆包] 聊天界面，返回已缓存的', chatImages.length, '张图片');
            return chatImages;
        }
        
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
            
            // 旧方法：兼容旧版页面结构
            if (window._ROUTER_DATA) {
                const loaderData = window._ROUTER_DATA.loaderData;
                
                let messageSnapshot = null;
                
                if (loaderData?.["thread_(token)/page"]?.data?.message_snapshot?.message_list) {
                    messageSnapshot = loaderData["thread_(token)/page"].data.message_snapshot.message_list;
                } else if (loaderData?.["routes/thread_(token)/page"]?.data?.message_snapshot?.message_list) {
                    messageSnapshot = loaderData["routes/thread_(token)/page"].data.message_snapshot.message_list;
                } else if (loaderData?.["thread/page"]?.data?.message_snapshot?.message_list) {
                    messageSnapshot = loaderData["thread/page"].data.message_snapshot.message_list;
                }

                if (messageSnapshot) {
                    console.log('[无印豆包] 找到消息列表，共', messageSnapshot.length, '条消息');

                    for (const message of messageSnapshot) {
                        for (const block of message.content_block || []) {
                            try {
                                const contentData = JSON.parse(block.content_v2);
                                if (contentData.creation_block?.creations) {
                                    for (const creation of contentData.creation_block.creations) {
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
                            } catch (e) {
                                continue;
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
                
                .image-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                    gap: 16px;
                }
                
                .image-item {
                    position: relative;
                    border-radius: 8px;
                    overflow: hidden;
                    border: 1px solid #e0e0e0;
                    background: #fafafa;
                    transition: all 0.2s ease;
                }
                
                .image-item:hover {
                    border-color: #1f1f1f;
                }
                
                .image-item img {
                    width: 100%;
                    height: 220px;
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
                
                .image-item:hover .image-info {
                    opacity: 1;
                }
                
                .image-actions {
                    display: flex;
                    gap: 8px;
                    padding: 10px;
                    background: #ffffff;
                    border-top: 1px solid #e0e0e0;
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
            <div id="doubao-nomark-btn" title="提取无水印图片">
                📷
                <span class="count">0</span>
            </div>
            <div id="doubao-nomark-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="modal-header-left">
                            <h3>无水印图片</h3>
                            <div class="subtitle" id="image-subtitle">共 0 张图片</div>
                        </div>
                        <button class="close-btn">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="image-grid" id="image-container"></div>
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
        const imageContainer = document.getElementById('image-container');
        const imageSubtitle = document.getElementById('image-subtitle');

        let currentImages = [];

        function updateImageCount() {
            const images = extractImages();
            currentImages = images;
            const count = images.length;
            floatingBtn.querySelector('.count').textContent = count;
            imageSubtitle.textContent = `共 ${count} 张图片`;
            return images;
        }

        floatingBtn.addEventListener('click', () => {
            const images = updateImageCount();
            
            if (images.length === 0) {
                imageContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🖼️</div>
                        <div class="empty-state-text">当前页面没有找到图片</div>
                    </div>
                `;
            } else {
                imageContainer.innerHTML = images.map((image, index) => `
                    <div class="image-item">
                        <img src="${image.url}" alt="图片 ${index + 1}" loading="lazy">
                        <div class="image-info">${image.width} × ${image.height}</div>
                        <div class="image-actions">
                            <button class="action-btn btn-download" data-url="${image.url}" data-index="${index}">下载</button>
                            <button class="action-btn btn-copy" data-url="${image.url}" data-index="${index}">复制地址</button>
                        </div>
                    </div>
                `).join('');

                imageContainer.querySelectorAll('.btn-download').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const url = btn.dataset.url;
                        const index = btn.dataset.index;
                        downloadImage(url, `doubao_image_${parseInt(index) + 1}.png`);
                        btn.classList.add('success');
                        btn.textContent = '✓ 已下载';
                        setTimeout(() => {
                            btn.classList.remove('success');
                            btn.textContent = '下载';
                        }, 2000);
                    });
                });
                
                imageContainer.querySelectorAll('.btn-copy').forEach(btn => {
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

    function initScript() {
        console.log('[无印豆包] 脚本已加载');
        
        if (window.location.pathname.includes('/chat/')) {
            createFloatingButton();
            return;
        }
        
        const hasScriptData = !!document.querySelector('script[data-script-src="modern-run-router-data-fn"]');
        const hasRouterData = !!window._ROUTER_DATA;
        if (!hasScriptData && !hasRouterData) {
            console.warn('[无印豆包] 页面数据仍未加载，等待中...');
            setTimeout(initScript, 1000);
            return;
        }
        
        createFloatingButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScript);
    } else {
        initScript();
    }

})();
