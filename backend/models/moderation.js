import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true },
    moderators: { type: [String], default: [] },
    mutedIds: { type: [String], default: [] },
    bannedIds: { type: [String], default: [] }},
    {
        timestamps: true
});

const reportSchema = new mongoose.Schema({
    room: { type: String, required: true, index: true },
    messageId: { type: String, required: true },
    reporterId: { type: String, required: true },
    reportedId: { type: String, default: '' },
    text: { type: String, default: '' },
    reason: { type: String, default: '' }},
    {
        timestamps: true
});
reportSchema.index({ messageId: 1, reporterId: 1 }, { unique: true });

export const Room = mongoose.model('Room', roomSchema);
export const Report = mongoose.model('Report', reportSchema);
