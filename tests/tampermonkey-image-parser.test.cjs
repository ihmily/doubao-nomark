const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const script = fs.readFileSync(path.join(__dirname, '../extension/tampermonkey-script/doubao-nomark.user.js'), 'utf8');

function sourceBetween(start, end) {
    return script.slice(script.indexOf(start), script.indexOf(end));
}

function createParser() {
    const images = [];
    const context = {
        console: { log() {}, warn() {} },
        chatImages: images,
        pageWindow: { _ROUTER_DATA: null },
        addChatImage(image) {
            if (!image?.url || images.some(existing => existing.url === image.url)) return false;
            images.push(image);
            return true;
        },
        handleDoubaoCreationVideo() {}
    };
    vm.createContext(context);
    vm.runInContext(sourceBetween('    function getCreationImageInfo(', '    function addChatVideo(')
        + sourceBetween('    function parseStreamChunk(', '    async function getDoubaoVideoInfo(')
        + sourceBetween('    function parseJsonString(', '    function isHttpUrl(')
        + sourceBetween('    function parseChatHistoryImages(', '    function extractSharePageImages('), context);
    return { context, images };
}

test('history parser finds all images in a rich media layout alongside a single creation', () => {
    const { context, images } = createParser();
    const image = id => ({ image: { image_ori_raw: { url: `https://example.com/${id}.png`, width: 1536, height: 1536 } } });
    context.parseChatHistoryImages([
        { content_block: [{ content: { creation_block: { creations: [image('single')] } } }] },
        { content_block: [{ content: { rich_media_layout_block: { media: ['a', 'b', 'c', 'd'].map(id => ({ creation: image(id) })) } } }] }
    ]);
    assert.deepEqual(images.map(item => item.url), ['single', 'a', 'b', 'c', 'd'].map(id => `https://example.com/${id}.png`));
});

test('router preload supplies grouped images without a history request', () => {
    const { context, images } = createParser();
    context.pageWindow._ROUTER_DATA = { loaderData: { chat_layout: {
        'chat_(id)/page': { messageList: { message_list: [
            { content_block: [{ content: { rich_media_layout_block: { media: [1, 2, 3, 4].map(id => ({
                creation: { image: { image_ori_raw: { url: `https://example.com/${id}.png` } } }
            })) } } }] }
        ] } }
    } } };
    context.parseChatRouterImages();
    assert.equal(images.length, 4);
});

test('stream patch collects every rich media item and deduplicates repeated patches', () => {
    const { context, images } = createParser();
    const patch = { patch_op: [{ patch_value: { content_block: [{ content: {
        rich_media_layout_block: { media: [1, 2].map(id => ({
            creation: { image: { image_ori_raw: { url: `https://example.com/${id}.png` } } }
        })) }
    } }] } }] };
    context.parseStreamChunk(patch);
    context.parseStreamChunk(patch);
    assert.equal(images.length, 2);
});
