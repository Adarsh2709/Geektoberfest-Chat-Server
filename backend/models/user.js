import mongoose from 'mongoose';


const messageSchema = new mongoose.Schema({
    room: { type: String, required: true, index: true },
    sender: { type: String, required: true },
    senderId: { type: String },
    text: { type: String, required: true },
    deleted: { type: Boolean, default: false },
    deletedBy: { type: String },
    timestamp: { type: Date, default: Date.now }},
    {
        timestamps: true 
});

export const Message = mongoose.model('Message', messageSchema);
