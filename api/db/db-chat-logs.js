import dbConnect from './db-connect.js';
import { Chat } from '../../models/chat.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function chatLogsHandler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        await dbConnect();
        console.log('DB Connected in chat-logs endpoint');

        const totalCount = await Chat.countDocuments();
        console.log('Total documents in collection:', totalCount);

        let chats;
        const { days, startDate, endDate, filterType, presetValue, department, referringUrl } = req.query;
        const chatPopulate = [
            { path: 'user', select: 'email' }, // <-- populate user email
            {
                path: 'interactions',
                populate: [
                    { path: 'context' },
                    {
                        path: 'expertFeedback',
                        model: 'ExpertFeedback',
                        select: '-__v'
                    },
                    {
                        path: 'publicFeedback',
                        model: 'PublicFeedback',
                        select: '-__v'
                    },
                    { 
                        path: 'question',
                        select: '-embedding'
                    },
                    {
                        path: 'answer',
                        select: '-embedding -sentenceEmbeddings',
                        populate: [
                            { path: 'sentences' },
                            { path: 'citation' },
                            { path: 'tools' },
                        ]
                    },
                    {
                        path: 'autoEval',
                        model: 'Eval',
                        populate: {
                            path: 'expertFeedback',
                            model: 'ExpertFeedback',
                            select: '-__v'
                        }
                    }
                ]
            }
        ];

        // Build date filter based on new parameters or fallback to legacy days parameter
        let dateFilter = {};
        
        if (startDate && endDate) {
            // New date range filter
            dateFilter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        } else if (filterType === 'preset' && presetValue && presetValue !== 'all') {
            // Preset filter
            const hours = parseInt(presetValue) * 24;
            const end = new Date();
            const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
            dateFilter.createdAt = {
                $gte: start,
                $lte: end
            };
        } else if (days) {
            // Legacy days parameter support
            if (days === 'all') {
                // Return all logs - no date filter
            } else {
                const daysNum = parseInt(days) || 1;
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - daysNum);
                dateFilter.createdAt = { $gte: startDate };
            }
        }


        // If department or referringUrl filter is present, use aggregation pipeline
        if ((department && department.trim() !== '') || (referringUrl && referringUrl.trim() !== '')) {
            // Build match stage for date filter
            const matchStage = Object.keys(dateFilter).length > 0 ? { $match: dateFilter } : {};

            // Lookup interactions and their contexts
            const pipeline = [];
            if (Object.keys(matchStage).length > 0) pipeline.push(matchStage);
            pipeline.push(
                {
                    $lookup: {
                        from: 'interactions',
                        localField: 'interactions',
                        foreignField: '_id',
                        as: 'interactions_docs',
                        pipeline: [
                            {
                                $lookup: {
                                    from: 'contexts', // The collection name for the Context model
                                    localField: 'context',
                                    foreignField: '_id',
                                    as: 'context_doc'
                                }
                            },
                            {
                                $addFields: {
                                    context: { $arrayElemAt: ['$context_doc', 0] }
                                }
                            }
                        ]
                    }
                }
            );

            // Build filter for interactions_docs
            const interactionMatch = {};
            if (department && department.trim() !== '') {
                const deptParts = department.split('-').map(d => d.trim()).filter(Boolean);
                interactionMatch['interactions_docs'] = {
                    $elemMatch: {
                        'context.department': { $regex: deptParts.join('|'), $options: 'i' }
                    }
                };
            }
            if (referringUrl && referringUrl.trim() !== '') {
                // Escape regex special characters for literal match
                const escapedUrl = referringUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                interactionMatch['interactions_docs'] = {
                    ...(interactionMatch['interactions_docs'] || {}),
                    $elemMatch: { 
                        ...(interactionMatch['interactions_docs']?.$elemMatch || {}),
                        referringUrl: { $regex: escapedUrl, $options: 'i' } 
                    }
                };
            }

            if (Object.keys(interactionMatch).length > 0) {
                pipeline.push({ $match: interactionMatch });
            }

            pipeline.push({ $sort: { createdAt: -1 } });

            chats = await Chat.aggregate(pipeline);
            // Populate referenced fields manually after aggregation
            chats = await Chat.populate(chats, chatPopulate);
        } else {
            // No department/referringUrl filter, use normal find
            const combinedFilter = { ...dateFilter };
            chats = await Chat.find(combinedFilter)
                .populate(chatPopulate)
                .sort({ createdAt: -1 });
        }

        return res.status(200).json({
            success: true,
            logs: chats
        });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({
            error: 'Failed to fetch logs',
            details: error.message
        });
    }
}

export default function handler(req, res) {
    return withProtection(chatLogsHandler, authMiddleware, adminMiddleware)(req, res);
}
