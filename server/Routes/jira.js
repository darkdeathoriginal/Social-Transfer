const express = require("express");
const { client } = require("../../WA_index"); 
const router = express.Router();

const JIRA_WEBHOOK_SECRET = process.env.JIRA_WEBHOOK_SECRET;

// Helper function to format duration from seconds
function formatDuration(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) return "N/A";
    if (totalSeconds === 0) return "0m";

    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    let durationStr = "";
    if (days > 0) durationStr += `${days}d `;
    if (hours > 0) durationStr += `${hours}h `;
    if (minutes > 0) durationStr += `${minutes}m`;

    return durationStr.trim() || "0m"; // Handle case where it's less than a minute
}

// Helper to try and extract plain text from Jira's ADF (Atlassian Document Format) for simple cases
function getPlainTextFromADF(adfNode) {
    let text = "";
    if (!adfNode || !adfNode.content) return "";

    function extract(node) {
        if (node.type === "text" && node.text) {
            text += node.text;
        } else if (node.content && Array.isArray(node.content)) {
            node.content.forEach(extract);
        }
        if (node.type === "hardBreak" || node.type === "paragraph" && text.length > 0 && !text.endsWith('\n')) {
             text += '\n'; // Add newline for paragraphs or hard breaks if content exists
        }
    }
    adfNode.content.forEach(extract);
    return text.replace(/\n\s*\n/g, '\n').trim(); // Consolidate multiple newlines and trim
}


router.post("/", async (req, res) => {
    const jiraPayload = req.body;
    const jid = req.query.jid || "919072215994@s.whatsapp.net";

    if (JIRA_WEBHOOK_SECRET) {
        console.warn("Jira webhook: Security check is a placeholder. Implement actual validation.");
    }
    // --- END SECURITY CHECK ---

    if (!jiraPayload || Object.keys(jiraPayload).length === 0) {
        return res.status(400).send("No Jira payload received.");
    }

    // Respond to Jira quickly to avoid timeouts
    res.status(200).send("Jira webhook received successfully.");

    try {
        let whatsappMessage = "";
        const eventType = jiraPayload.webhookEvent;
        const issue = jiraPayload.issue; // Often present for issue-related events
        const user = jiraPayload.user;   // User who triggered the webhook (might not be the actor for the specific change)
        const timestamp = jiraPayload.timestamp ? new Date(jiraPayload.timestamp).toLocaleString() : new Date().toLocaleString();


        // --- Determine Actor and Issue Details (common extractions) ---
        // The actual user who performed the action can be in different places
        let actorName = user?.displayName || user?.name || user?.key || "An unknown user";
        const issueKey = issue?.key;
        const issueSummary = issue?.fields?.summary;
        // Construct a browse URL: jiraBaseUrl/browse/ISSUE-KEY
        // Assuming jiraPayload.issue.self contains something like: https://your-jira.atlassian.net/rest/api/2/issue/12345
        const jiraBaseUrl = issue?.self?.substring(0, issue.self.indexOf("/rest/api"));
        const issueLink = issueKey && jiraBaseUrl ? `${jiraBaseUrl}/browse/${issueKey}` : "N/A";

        // --- Event Specific Handling ---
        if (eventType === "jira:issue_created") {
            actorName = issue?.fields?.reporter?.displayName || actorName; // Reporter is more relevant here
            whatsappMessage = `✅ *New Issue Created* by ${actorName}\n\n`;
            whatsappMessage += `🔑 *${issueKey}*: ${issueSummary}\n`;
            whatsappMessage += `📝 Status: ${issue?.fields?.status?.name}\n`;
            if (issue?.fields?.assignee) {
                whatsappMessage += `👤 Assignee: ${issue.fields.assignee.displayName || issue.fields.assignee.name}\n`;
            }
            whatsappMessage += `🔗 Link: ${issueLink}`;
        }
        else if (eventType === "jira:issue_updated") {
            actorName = jiraPayload.user?.displayName || "Unknown User"; // User who made the update
            whatsappMessage = `⚙️ *Issue Updated* by ${actorName}\n\n`;
            whatsappMessage += `🔑 *${issueKey}*: ${issueSummary}\n`;

            const changelog = jiraPayload.changelog;
            if (changelog && changelog.items && changelog.items.length > 0) {
                whatsappMessage += `\n*Changes:*\n`;
                changelog.items.forEach(item => {
                    const fieldName = item.field.charAt(0).toUpperCase() + item.field.slice(1);
                    const from = item.fromString || "_empty_";
                    const to = item.toString || "_empty_";
                    whatsappMessage += `  • *${fieldName}*: _${from}_ → *${to}*\n`;
                });
            } else {
                whatsappMessage += `ℹ️ _(General update or no specific field changes detailed)_ \n`;
            }
            whatsappMessage += `\n🔗 Link: ${issueLink}`;
        }
        else if (eventType === "jira:issue_deleted") {
            actorName = jiraPayload.user?.displayName || "Unknown User";
            // Issue details might be minimal or from a different part of the payload if 'issue' is gone
            const deletedIssueKey = jiraPayload.issueKey || issueKey || "Unknown Key";
            const deletedIssueSummary = jiraPayload.issueSummary || issueSummary || "Unknown Summary";

            whatsappMessage = `🗑️ *Issue Deleted* by ${actorName}\n\n`;
            whatsappMessage += `🔑 *${deletedIssueKey}*: ${deletedIssueSummary}`;
            // No link as it's deleted
        }
        else if (eventType === "jira:comment_created" || eventType === "comment_created") {
            const comment = jiraPayload.comment;
            actorName = comment?.author?.displayName || actorName;
            const commentBody = getPlainTextFromADF(comment?.body) || (typeof comment?.body === 'string' ? comment.body : "") || "_empty comment_";

            whatsappMessage = `💬 *New Comment* by ${actorName} on *${issueKey}*\n\n`;
            whatsappMessage += `_"${commentBody.substring(0, 500)}${commentBody.length > 500 ? '...' : ''}"_\n`; // Limit comment length
            whatsappMessage += `\n🔗 Link: ${issueLink}`; // Or construct comment specific link if available
        }
        else if (eventType === "jira:comment_updated" || eventType === "comment_updated") {
            const comment = jiraPayload.comment;
            actorName = comment?.updateAuthor?.displayName || actorName;
            const commentBody = getPlainTextFromADF(comment?.body) || (typeof comment?.body === 'string' ? comment.body : "") || "_empty comment_";

            whatsappMessage = `✏️ *Comment Updated* by ${actorName} on *${issueKey}*\n\n`;
            whatsappMessage += `_New content:_\n_"${commentBody.substring(0, 500)}${commentBody.length > 500 ? '...' : ''}"_\n`;
            whatsappMessage += `\n🔗 Link: ${issueLink}`;
        }
        else if (eventType === "jira:comment_deleted" || eventType === "comment_deleted") {
            const comment = jiraPayload.comment; // May contain ID of deleted comment
            actorName = jiraPayload.user?.displayName || "Unknown User"; // User who deleted
            const deletedCommentAuthor = comment?.author?.displayName || "Unknown";

            whatsappMessage = `🗑️ *Comment Deleted* by ${actorName} on *${issueKey}*\n\n`;
            whatsappMessage += `_(Comment by ${deletedCommentAuthor} was removed)_\n`;
            whatsappMessage += `\n🔗 Link: ${issueLink}`;
        }
        else if (eventType === "jira:worklog_created") {
            const worklog = jiraPayload.worklog;
            actorName = worklog?.author?.displayName || actorName;
            const timeSpent = formatDuration(worklog?.timeSpentSeconds);
            const worklogComment = getPlainTextFromADF(worklog?.comment) || (typeof worklog?.comment === 'string' ? worklog.comment : "") || "_No comment_";

            whatsappMessage = `⏱️ *Work Logged* by ${actorName} on *${issueKey}*\n\n`;
            whatsappMessage += `⏰ Time Spent: *${timeSpent}*\n`;
            whatsappMessage += `💬 Comment: _"${worklogComment.substring(0, 200)}${worklogComment.length > 200 ? '...' : ''}"_\n`;
            whatsappMessage += `\n🔗 Link: ${issueLink}`;
        }
        else if (eventType === "jira:worklog_updated") {
            const worklog = jiraPayload.worklog;
            actorName = worklog?.updateAuthor?.displayName || actorName;
            const timeSpent = formatDuration(worklog?.timeSpentSeconds);
            const worklogComment = getPlainTextFromADF(worklog?.comment) || (typeof worklog?.comment === 'string' ? worklog.comment : "") || "_No comment_";

            whatsappMessage = `🔄 *Worklog Updated* by ${actorName} on *${issueKey}*\n\n`;
            whatsappMessage += `⏰ New Time Spent: *${timeSpent}*\n`;
            whatsappMessage += `💬 New Comment: _"${worklogComment.substring(0, 200)}${worklogComment.length > 200 ? '...' : ''}"_\n`;
            whatsappMessage += `\n🔗 Link: ${issueLink}`;
        }
        else if (eventType === "jira:worklog_deleted") {
            const worklog = jiraPayload.worklog; // May contain ID of deleted worklog
            actorName = jiraPayload.user?.displayName || "Unknown User";

            whatsappMessage = `🗑️ *Worklog Deleted* by ${actorName} on *${issueKey}*\n\n`;
            whatsappMessage += `_(Worklog ID: ${worklog?.id || "Unknown"} by ${worklog?.author?.displayName || "Unknown"} was removed)_\n`;
            whatsappMessage += `\n🔗 Link: ${issueLink}`;
        }
        else if (eventType === "jira:attachment_created") {
            const attachment = jiraPayload.attachment;
            actorName = attachment?.author?.displayName || actorName;

            whatsappMessage = `📎 *Attachment Added* by ${actorName} to *${issueKey}*\n\n`;
            whatsappMessage += `📄 File: *${attachment?.filename}* (${attachment?.mimeType})\n`;
            whatsappMessage += `\n🔗 Link: ${issueLink}`;
        }
        else if (eventType === "jira:attachment_deleted") {
            const attachment = jiraPayload.attachment; // May contain details of deleted attachment
            actorName = jiraPayload.user?.displayName || "Unknown User";

            whatsappMessage = `🗑️ *Attachment Deleted* by ${actorName} from *${issueKey}*\n\n`;
            whatsappMessage += `📄 File: *${attachment?.filename || "Unknown"}*\n`;
            whatsappMessage += `\n🔗 Link: ${issueLink}`;
        }
        else if (eventType === "issuelink_created" || eventType === "jira:issue_link_created") {
            const issueLinkData = jiraPayload.issueLink;
            actorName = jiraPayload.user?.displayName || "Unknown User";
            // Jira Cloud usually provides sourceIssueKey and destinationIssueKey directly in issueLink object
            const sourceKey = issueLinkData?.sourceIssueKey || (jiraPayload.issue?.key === issueLinkData?.sourceIssueId.toString() ? jiraPayload.issue.key : issueLinkData?.sourceIssueId);
            const destKey = issueLinkData?.destinationIssueKey || issueLinkData?.destinationIssueId;
            const linkTypeName = issueLinkData?.issueLinkType?.name;
            const sourceIssueBrowseUrl = jiraBaseUrl && sourceKey ? `${jiraBaseUrl}/browse/${sourceKey}` : null;


            whatsappMessage = `🔗 *Issue Link Created* by ${actorName}\n\n`;
            whatsappMessage += `*${sourceKey}* _${linkTypeName}_ *${destKey}*\n`;
            if (sourceIssueBrowseUrl) {
                whatsappMessage += `\n➡️ View Source: ${sourceIssueBrowseUrl}`;
            }
        }
        else if (eventType === "issuelink_deleted" || eventType === "jira:issue_link_deleted") {
            const issueLinkData = jiraPayload.issueLink;
            actorName = jiraPayload.user?.displayName || "Unknown User";
            const sourceKey = issueLinkData?.sourceIssueKey || (jiraPayload.issue?.key === issueLinkData?.sourceIssueId.toString() ? jiraPayload.issue.key : issueLinkData?.sourceIssueId);
            const destKey = issueLinkData?.destinationIssueKey || issueLinkData?.destinationIssueId;
            const linkTypeName = issueLinkData?.issueLinkType?.name;
            const sourceIssueBrowseUrl = jiraBaseUrl && sourceKey ? `${jiraBaseUrl}/browse/${sourceKey}` : null;

            whatsappMessage = `🗑️ *Issue Link Deleted* by ${actorName}\n\n`;
            whatsappMessage += `~${sourceKey} *${linkTypeName}* ${destKey}~\n_(Link removed)_\n`;
             if (sourceIssueBrowseUrl) {
                whatsappMessage += `\n➡️ View Source: ${sourceIssueBrowseUrl}`;
            }
        }
        if (whatsappMessage) {
            whatsappMessage += `\n\n🕒 _${timestamp}_`; // Add timestamp to all messages
            await client.sendMessage(jid, { text: whatsappMessage });
            console.log(`Jira update message sent to ${jid} for event: ${eventType}`);
        } else {
            console.log(`Jira event type "${eventType}" received at ${timestamp} but not specifically handled for WhatsApp notification. Payload keys: ${Object.keys(jiraPayload).join(', ')}`);
        }

    } catch (error) {
        console.error(`Error processing Jira webhook for event "${jiraPayload?.webhookEvent}" or sending WhatsApp message:`, error);
    }
});

module.exports = router;
