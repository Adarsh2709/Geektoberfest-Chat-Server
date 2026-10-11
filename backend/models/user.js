import mongoose from 'mongoose';


const messageSchema = new mongoose.Schema({
    room: { type: String, required: true, index: true },
    sender: { type: String, required: true },
    senderId: { type: String },
    text: { type: String, required: true },
    mentions: { type: [String], default: [] },
    timestamp: { type: Date, default: Date.now }},
    {
        timestamps: true 
});

messageSchema.index({ room: 1, createdAt: -1 });
messageSchema.index({ room: 1, sender: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
