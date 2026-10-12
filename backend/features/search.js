import { Message } from '../models/user.js';
import { SEARCH_PAGE_SIZE, buildSearchFilter } from '../utils/search.js';

// GET /api/search?room=&q=&user=&before= finds messages in one room by keyword and/or display
// name, newest first, with a createdAt cursor for older pages. Removed messages are skipped.
export async function setup({ app, allowedOrigins }) {
  try {
    await Message.collection.createIndex({ room: 1, createdAt: -1 });
    await Message.collection.createIndex({ room: 1, sender: 1, createdAt: -1 });
  } catch (error) {
    console.error(`Could not create message search indexes: ${error.message}`);
  }

  app.get('/api/search', async (req, res) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
    }

    const { filter, error } = buildSearchFilter(req.query);
    if (error) return res.status(400).json({ error });

    try {
      const found = await Message.find({ ...filter, deleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .limit(SEARCH_PAGE_SIZE + 1)
        .lean();
      const hasMore = found.length > SEARCH_PAGE_SIZE;
      const messages = found.slice(0, SEARCH_PAGE_SIZE).map(({ sender, senderId, text, timestamp, createdAt }) => (
        { sender, senderId, text, timestamp, createdAt }
      ));
      res.json({ messages, hasMore });
    } catch (searchError) {
      console.error(`Message search failed: ${searchError.message}`);
      res.status(500).json({ error: 'Search failed.' });
    }
  });
}
