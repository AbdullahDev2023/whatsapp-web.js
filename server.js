const express = require('express');
const multer = require('multer');
const { Client, Location, Poll, List, Buttons, LocalAuth } = require('./index');

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Global client instance
let client;
let clientReady = false;

// Initialize WhatsApp client
function initializeClient() {
    client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: { 
            headless: false,
        }
    });

    client.initialize();

    client.on('loading_screen', (percent, message) => {
        console.log('LOADING SCREEN', percent, message);
    });

    client.on('qr', async (qr) => {
        console.log('QR RECEIVED', qr);
    });

    client.on('code', (code) => {
        console.log('Pairing code:', code);
    });

    client.on('authenticated', () => {
        console.log('AUTHENTICATED');
    });

    client.on('auth_failure', msg => {
        console.error('AUTHENTICATION FAILURE', msg);
        clientReady = false;
    });

    client.on('ready', async () => {
        console.log('READY');
        clientReady = true;
        const debugWWebVersion = await client.getWWebVersion();
        console.log(`WWebVersion = ${debugWWebVersion}`);
    });

    client.on('message', async msg => {
        console.log('MESSAGE RECEIVED', msg);
    });

    client.on('disconnected', (reason) => {
        console.log('Client was logged out', reason);
        clientReady = false;
    });
}

// Middleware to check if client is ready
function checkClientReady(req, res, next) {
    if (!clientReady) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }
    next();
}

// Status endpoint
app.get('/status', (req, res) => {
    res.json({ 
        ready: clientReady,
        timestamp: new Date().toISOString()
    });
});

// Initialize WhatsApp client
app.post('/initialize', (req, res) => {
    if (clientReady) {
        return res.json({ message: 'Client already initialized' });
    }
    initializeClient();
    res.json({ message: 'Client initialization started' });
});

// Send a simple message
app.post('/send-message', checkClientReady, async (req, res) => {
    try {
        const { to, message } = req.body;
        if (!to || !message) {
            return res.status(400).json({ error: 'to and message are required' });
        }
        
        const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
        const result = await client.sendMessage(chatId, message);
        res.json({ success: true, messageId: result.id._serialized });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send a reply to a specific message
app.post('/reply-message', checkClientReady, async (req, res) => {
    try {
        const { messageId, reply } = req.body;
        if (!messageId || !reply) {
            return res.status(400).json({ error: 'messageId and reply are required' });
        }
        
        const message = await client.getMessageById(messageId);
        await message.reply(reply);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Set group subject
app.post('/set-subject', checkClientReady, async (req, res) => {
    try {
        const { chatId, subject } = req.body;
        if (!chatId || !subject) {
            return res.status(400).json({ error: 'chatId and subject are required' });
        }
        
        const chat = await client.getChatById(chatId);
        if (!chat.isGroup) {
            return res.status(400).json({ error: 'This can only be used in a group' });
        }
        
        await chat.setSubject(subject);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Set group description
app.post('/set-description', checkClientReady, async (req, res) => {
    try {
        const { chatId, description } = req.body;
        if (!chatId || !description) {
            return res.status(400).json({ error: 'chatId and description are required' });
        }
        
        const chat = await client.getChatById(chatId);
        if (!chat.isGroup) {
            return res.status(400).json({ error: 'This can only be used in a group' });
        }
        
        await chat.setDescription(description);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Leave group
app.post('/leave-group', checkClientReady, async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }
        
        const chat = await client.getChatById(chatId);
        if (!chat.isGroup) {
            return res.status(400).json({ error: 'This can only be used in a group' });
        }
        
        await chat.leave();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Join group by invite code
app.post('/join-group', checkClientReady, async (req, res) => {
    try {
        const { inviteCode } = req.body;
        if (!inviteCode) {
            return res.status(400).json({ error: 'inviteCode is required' });
        }
        
        await client.acceptInvite(inviteCode);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add members to group
app.post('/add-members', checkClientReady, async (req, res) => {
    try {
        const { chatId, participants } = req.body;
        if (!chatId || !participants || !Array.isArray(participants)) {
            return res.status(400).json({ error: 'chatId and participants array are required' });
        }
        
        const group = await client.getChatById(chatId);
        const formattedParticipants = participants.map(p => p.includes('@c.us') ? p : `${p}@c.us`);
        const result = await group.addParticipants(formattedParticipants);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create group
app.post('/create-group', checkClientReady, async (req, res) => {
    try {
        const { title, participants } = req.body;
        if (!title || !participants || !Array.isArray(participants)) {
            return res.status(400).json({ error: 'title and participants array are required' });
        }
        
        const formattedParticipants = participants.map(p => p.includes('@c.us') ? p : `${p}@c.us`);
        const result = await client.createGroup(title, formattedParticipants);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get group info
app.get('/group-info/:chatId', checkClientReady, async (req, res) => {
    try {
        const { chatId } = req.params;
        const chat = await client.getChatById(chatId);
        
        if (!chat.isGroup) {
            return res.status(400).json({ error: 'This can only be used in a group' });
        }
        
        const groupInfo = {
            name: chat.name,
            description: chat.description,
            createdAt: chat.createdAt,
            owner: chat.owner.user,
            participantCount: chat.participants.length,
            participants: chat.participants
        };
        
        res.json(groupInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all chats
app.get('/chats', checkClientReady, async (req, res) => {
    try {
        const chats = await client.getChats();
        const chatList = chats.map(chat => ({
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp
        }));
        res.json({ count: chats.length, chats: chatList });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get client info
app.get('/info', checkClientReady, async (req, res) => {
    try {
        const info = client.info;
        res.json({
            pushname: info.pushname,
            number: info.wid.user,
            platform: info.platform
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send location
app.post('/send-location', checkClientReady, async (req, res) => {
    try {
        const { to, latitude, longitude, name, address, url } = req.body;
        if (!to || !latitude || !longitude) {
            return res.status(400).json({ error: 'to, latitude, and longitude are required' });
        }
        
        const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
        const location = new Location(latitude, longitude, { name, address, url });
        await client.sendMessage(chatId, location);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Set status
app.post('/set-status', checkClientReady, async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'status is required' });
        }
        
        await client.setStatus(status);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mention users
app.post('/mention-users', checkClientReady, async (req, res) => {
    try {
        const { chatId, message, mentions } = req.body;
        if (!chatId || !message || !mentions || !Array.isArray(mentions)) {
            return res.status(400).json({ error: 'chatId, message, and mentions array are required' });
        }
        
        const chat = await client.getChatById(chatId);
        const formattedMentions = mentions.map(m => m.includes('@c.us') ? m : `${m}@c.us`);
        await chat.sendMessage(message, { mentions: formattedMentions });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mention groups
app.post('/mention-groups', checkClientReady, async (req, res) => {
    try {
        const { chatId, message, groupMentions } = req.body;
        if (!chatId || !message || !groupMentions) {
            return res.status(400).json({ error: 'chatId, message, and groupMentions are required' });
        }
        
        const chat = await client.getChatById(chatId);
        await chat.sendMessage(message, { groupMentions });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete message
app.post('/delete-message', checkClientReady, async (req, res) => {
    try {
        const { messageId, forEveryone = true } = req.body;
        if (!messageId) {
            return res.status(400).json({ error: 'messageId is required' });
        }
        
        const message = await client.getMessageById(messageId);
        if (!message.fromMe) {
            return res.status(400).json({ error: 'Can only delete own messages' });
        }
        
        await message.delete(forEveryone);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Pin chat
app.post('/pin-chat', checkClientReady, async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }
        
        const chat = await client.getChatById(chatId);
        await chat.pin();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Archive chat
app.post('/archive-chat', checkClientReady, async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }
        
        const chat = await client.getChatById(chatId);
        await chat.archive();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mute chat
app.post('/mute-chat', checkClientReady, async (req, res) => {
    try {
        const { chatId, duration = 20 } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }
        
        const chat = await client.getChatById(chatId);
        const unmuteDate = new Date();
        unmuteDate.setSeconds(unmuteDate.getSeconds() + duration);
        await chat.mute(unmuteDate);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send typing state
app.post('/send-typing', checkClientReady, async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }
        
        const chat = await client.getChatById(chatId);
        await chat.sendStateTyping();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send recording state
app.post('/send-recording', checkClientReady, async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }
        
        const chat = await client.getChatById(chatId);
        await chat.sendStateRecording();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clear state
app.post('/clear-state', checkClientReady, async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }
        
        const chat = await client.getChatById(chatId);
        await chat.clearState();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send buttons
app.post('/send-buttons', checkClientReady, async (req, res) => {
    try {
        const { to, body, buttons, title, footer } = req.body;
        if (!to || !body || !buttons || !Array.isArray(buttons)) {
            return res.status(400).json({ error: 'to, body, and buttons array are required' });
        }
        
        const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
        const buttonObj = new Buttons(body, buttons, title, footer);
        await client.sendMessage(chatId, buttonObj);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send list
app.post('/send-list', checkClientReady, async (req, res) => {
    try {
        const { to, body, buttonText, sections, title, footer } = req.body;
        if (!to || !body || !buttonText || !sections || !Array.isArray(sections)) {
            return res.status(400).json({ error: 'to, body, buttonText, and sections array are required' });
        }
        
        const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
        const list = new List(body, buttonText, sections, title, footer);
        await client.sendMessage(chatId, list);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send reaction
app.post('/send-reaction', checkClientReady, async (req, res) => {
    try {
        const { messageId, reaction } = req.body;
        if (!messageId || !reaction) {
            return res.status(400).json({ error: 'messageId and reaction are required' });
        }
        
        const message = await client.getMessageById(messageId);
        await message.react(reaction);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send poll
app.post('/send-poll', checkClientReady, async (req, res) => {
    try {
        const { to, question, options, allowMultipleAnswers = false, messageSecret } = req.body;
        if (!to || !question || !options || !Array.isArray(options)) {
            return res.status(400).json({ error: 'to, question, and options array are required' });
        }
        
        const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
        const pollOptions = { allowMultipleAnswers };
        if (messageSecret) pollOptions.messageSecret = messageSecret;
        
        const poll = new Poll(question, options, pollOptions);
        await client.sendMessage(chatId, poll);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Edit message
app.post('/edit-message', checkClientReady, async (req, res) => {
    try {
        const { messageId, newText } = req.body;
        if (!messageId || !newText) {
            return res.status(400).json({ error: 'messageId and newText are required' });
        }
        
        const message = await client.getMessageById(messageId);
        if (!message.fromMe) {
            return res.status(400).json({ error: 'Can only edit own messages' });
        }
        
        await message.edit(newText);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update labels
app.post('/update-labels', checkClientReady, async (req, res) => {
    try {
        const { chatId, labelIds } = req.body;
        if (!chatId || !labelIds || !Array.isArray(labelIds)) {
            return res.status(400).json({ error: 'chatId and labelIds array are required' });
        }
        
        const chat = await client.getChatById(chatId);
        await chat.changeLabels(labelIds);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add labels
app.post('/add-labels', checkClientReady, async (req, res) => {
    try {
        const { chatId, newLabelIds } = req.body;
        if (!chatId || !newLabelIds || !Array.isArray(newLabelIds)) {
            return res.status(400).json({ error: 'chatId and newLabelIds array are required' });
        }
        
        const chat = await client.getChatById(chatId);
        let labels = (await chat.getLabels()).map((l) => l.id);
        labels.push(...newLabelIds);
        await chat.changeLabels(labels);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Remove labels
app.post('/remove-labels', checkClientReady, async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }
        
        const chat = await client.getChatById(chatId);
        await chat.changeLabels([]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Approve group membership request
app.post('/approve-request', checkClientReady, async (req, res) => {
    try {
        const { chatId, requesterIds, sleep } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }
        
        const options = {};
        if (requesterIds) options.requesterIds = requesterIds;
        if (sleep !== undefined) options.sleep = sleep;
        
        const result = await client.approveGroupMembershipRequests(chatId, options);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reject group membership request
app.post('/reject-request', checkClientReady, async (req, res) => {
    try {
        const { chatId, requesterIds, sleep } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }
        
        const options = {};
        if (requesterIds) options.requesterIds = requesterIds;
        if (sleep !== undefined) options.sleep = sleep;
        
        const result = await client.rejectGroupMembershipRequests(chatId, options);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Pin message
app.post('/pin-message', checkClientReady, async (req, res) => {
    try {
        const { messageId, duration = 86400 } = req.body;
        if (!messageId) {
            return res.status(400).json({ error: 'messageId is required' });
        }
        
        const message = await client.getMessageById(messageId);
        const result = await message.pin(duration);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Unpin message
app.post('/unpin-message', checkClientReady, async (req, res) => {
    try {
        const { messageId } = req.body;
        if (!messageId) {
            return res.status(400).json({ error: 'messageId is required' });
        }
        
        const message = await client.getMessageById(messageId);
        const result = await message.unpin();
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get device count
app.get('/device-count/:contactId', checkClientReady, async (req, res) => {
    try {
        const { contactId } = req.params;
        const deviceCount = await client.getContactDeviceCount(contactId);
        res.json({ deviceCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Sync history
app.post('/sync-history', checkClientReady, async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }
        
        const isSynced = await client.syncHistory(chatId);
        res.json({ success: true, isSynced });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get statuses/broadcasts
app.get('/statuses', checkClientReady, async (req, res) => {
    try {
        const statuses = await client.getBroadcasts();
        res.json({ statuses });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send media with file upload
app.post('/send-media', checkClientReady, upload.single('media'), async (req, res) => {
    try {
        const { to, caption, sendMediaAsHd = false, isViewOnce = false, sendAudioAsVoice = false } = req.body;
        if (!to || !req.file) {
            return res.status(400).json({ error: 'to and media file are required' });
        }
        
        const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
        const fs = require('fs');
        const mediaData = fs.readFileSync(req.file.path);
        
        const options = {
            caption,
            sendMediaAsHd,
            isViewOnce,
            sendAudioAsVoice
        };
        
        const mediaMessage = {
            mimetype: req.file.mimetype,
            data: mediaData.toString('base64'),
            filename: req.file.originalname
        };
        
        await client.sendMessage(chatId, mediaMessage, options);
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send vCard
app.post('/send-vcard', checkClientReady, async (req, res) => {
    try {
        const { to, vCard } = req.body;
        if (!to || !vCard) {
            return res.status(400).json({ error: 'to and vCard are required' });
        }
        
        const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
        await client.sendMessage(chatId, vCard);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Change background sync
app.post('/change-sync', checkClientReady, async (req, res) => {
    try {
        const { enabled = true } = req.body;
        const backgroundSync = await client.setBackgroundSync(enabled);
        res.json({ success: true, backgroundSync });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download media from message
app.get('/download-media/:messageId', checkClientReady, async (req, res) => {
    try {
        const { messageId } = req.params;
        const message = await client.getMessageById(messageId);
        
        if (!message.hasMedia) {
            return res.status(400).json({ error: 'Message does not have media' });
        }
        
        const media = await message.downloadMedia();
        res.json({
            mimetype: media.mimetype,
            filename: media.filename,
            data: media.data,
            dataLength: media.data.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get message info
app.get('/message-info/:messageId', checkClientReady, async (req, res) => {
    try {
        const { messageId } = req.params;
        const message = await client.getMessageById(messageId);
        
        res.json({
            id: message.id._serialized,
            body: message.body,
            type: message.type,
            timestamp: message.timestamp,
            from: message.from,
            to: message.to,
            author: message.author,
            fromMe: message.fromMe,
            hasMedia: message.hasMedia,
            hasQuotedMsg: message.hasQuotedMsg,
            isForwarded: message.isForwarded,
            isStatus: message.isStatus,
            isStarred: message.isStarred,
            broadcast: message.broadcast
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get quoted message
app.get('/quoted-message/:messageId', checkClientReady, async (req, res) => {
    try {
        const { messageId } = req.params;
        const message = await client.getMessageById(messageId);
        
        if (!message.hasQuotedMsg) {
            return res.status(400).json({ error: 'Message does not have quoted message' });
        }
        
        const quotedMsg = await message.getQuotedMessage();
        res.json({
            id: quotedMsg.id._serialized,
            type: quotedMsg.type,
            author: quotedMsg.author || quotedMsg.from,
            timestamp: quotedMsg.timestamp,
            hasMedia: quotedMsg.hasMedia,
            body: quotedMsg.body
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Jump to message
app.post('/jump-to-message', checkClientReady, async (req, res) => {
    try {
        const { messageId } = req.body;
        if (!messageId) {
            return res.status(400).json({ error: 'messageId is required' });
        }
        
        await client.interface.openChatWindowAt(messageId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get contacts
app.get('/contacts', checkClientReady, async (req, res) => {
    try {
        const contacts = await client.getContacts();
        const contactList = contacts.map(contact => ({
            id: contact.id._serialized,
            name: contact.name,
            pushname: contact.pushname,
            number: contact.number,
            isMe: contact.isMe,
            isUser: contact.isUser,
            isGroup: contact.isGroup,
            isWAContact: contact.isWAContact,
            isMyContact: contact.isMyContact,
            isBlocked: contact.isBlocked
        }));
        res.json({ contacts: contactList });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get chat by ID
app.get('/chat/:chatId', checkClientReady, async (req, res) => {
    try {
        const { chatId } = req.params;
        const chat = await client.getChatById(chatId);
        
        res.json({
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            isReadOnly: chat.isReadOnly,
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp,
            archived: chat.archived,
            pinned: chat.pinned,
            isMuted: chat.isMuted,
            muteExpiration: chat.muteExpiration,
            participants: chat.isGroup ? chat.participants : undefined,
            description: chat.isGroup ? chat.description : undefined,
            owner: chat.isGroup ? chat.owner : undefined,
            createdAt: chat.isGroup ? chat.createdAt : undefined
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get messages from chat
app.get('/messages/:chatId', checkClientReady, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { limit = 50 } = req.query;
        
        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: parseInt(limit) });
        
        const messageList = messages.map(msg => ({
            id: msg.id._serialized,
            body: msg.body,
            type: msg.type,
            timestamp: msg.timestamp,
            from: msg.from,
            to: msg.to,
            author: msg.author,
            fromMe: msg.fromMe,
            hasMedia: msg.hasMedia,
            hasQuotedMsg: msg.hasQuotedMsg
        }));
        
        res.json({ messages: messageList });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send message with link preview
app.post('/send-preview', checkClientReady, async (req, res) => {
    try {
        const { to, text } = req.body;
        if (!to || !text) {
            return res.status(400).json({ error: 'to and text are required' });
        }
        
        const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
        await client.sendMessage(chatId, text, { linkPreview: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(port, () => {
    console.log(`WhatsApp API server running at http://localhost:${port}`);
    console.log('Available endpoints:');
    console.log('GET  /status - Check if WhatsApp client is ready');
    console.log('POST /initialize - Initialize WhatsApp client');
    console.log('POST /send-message - Send a message');
    console.log('POST /reply-message - Reply to a message');
    console.log('POST /set-subject - Set group subject');
    console.log('POST /set-description - Set group description');
    console.log('POST /leave-group - Leave a group');
    console.log('POST /join-group - Join group by invite code');
    console.log('POST /add-members - Add members to group');
    console.log('POST /create-group - Create a new group');
    console.log('GET  /group-info/:chatId - Get group information');
    console.log('GET  /chats - Get all chats');
    console.log('GET  /info - Get client info');
    console.log('POST /send-location - Send location');
    console.log('POST /set-status - Set WhatsApp status');
    console.log('POST /mention-users - Mention users in message');
    console.log('POST /mention-groups - Mention groups in message');
    console.log('POST /delete-message - Delete a message');
    console.log('POST /pin-chat - Pin a chat');
    console.log('POST /archive-chat - Archive a chat');
    console.log('POST /mute-chat - Mute a chat');
    console.log('POST /send-typing - Send typing state');
    console.log('POST /send-recording - Send recording state');
    console.log('POST /clear-state - Clear typing/recording state');
    console.log('POST /send-buttons - Send interactive buttons');
    console.log('POST /send-list - Send interactive list');
    console.log('POST /send-reaction - Send reaction to message');
    console.log('POST /send-poll - Send a poll');
    console.log('POST /edit-message - Edit a message');
    console.log('POST /update-labels - Update chat labels');
    console.log('POST /add-labels - Add labels to chat');
    console.log('POST /remove-labels - Remove all labels from chat');
    console.log('POST /approve-request - Approve group membership request');
    console.log('POST /reject-request - Reject group membership request');
    console.log('POST /pin-message - Pin a message');
    console.log('POST /unpin-message - Unpin a message');
    console.log('GET  /device-count/:contactId - Get contact device count');
    console.log('POST /sync-history - Sync chat history');
    console.log('GET  /statuses - Get status broadcasts');
    console.log('POST /send-media - Send media file');
    console.log('POST /send-vcard - Send vCard contact');
    console.log('POST /change-sync - Change background sync setting');
    console.log('GET  /download-media/:messageId - Download media from message');
    console.log('GET  /message-info/:messageId - Get message information');
    console.log('GET  /quoted-message/:messageId - Get quoted message info');
    console.log('POST /jump-to-message - Jump to message in chat');
    console.log('GET  /contacts - Get all contacts');
    console.log('GET  /chat/:chatId - Get chat information');
    console.log('GET  /messages/:chatId - Get messages from chat');
    console.log('POST /send-preview - Send message with link preview');
});

// Initialize client on startup
initializeClient();