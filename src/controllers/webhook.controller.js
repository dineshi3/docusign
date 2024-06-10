const catchAsync = require('../utils/catchAsync');

const { toTitleCase } = require('../utils');

const { webhookService, mongoService } = require('../services');

const bindEvent = catchAsync(async (req, res) => {
  const { event, data, document } = req.body;

  try {
    const data = await mongoService.getRecordByDocumentId(data.documentId);
    if(data?.fromUser) {
      const { fromUser, fileName, subject } = data;
      const docName = fileName.split('.')[0];
      const metaDetails = {
        sender: {
          name: fromUser.signerName,
          email: fromUser.signerEmail,
        },
        document: {
          name: toTitleCase(docName),
        },
        email: {
          subject,
        },
      };
      data.metaData = metaDetails;
    } else {
      const parsed = JSON.parse(data.documentDescription);
      data.metaData = parsed;
    }
  } catch (error) {
    data.metaData = {
      sender: {
        senderName: extractNameFromEmail(data.ccDetails[0]?.emailAddress),
        senderEmail: data.ccDetails[0]?.emailAddress,
      },
      document: {
        name: data.messageTitle,
      },
    };
  }

  console.log('********** Webhook Bind **********');
  console.log(JSON.stringify(req.body));

  switch (event.eventType) {
    case 'Signed':
      await webhookService.sendSignedEmail({ data });
      break;
    case 'Sent':
      await webhookService.sendSignDocumentEmail({ data });
      break;
    case 'Completed':
      await webhookService.sendCompletedEmail({ data });
      break;
    default:
      break;
  }
  if(document)
    mongoService.updateDocumentById(data.documentId, document);

  res.json({ status: true, message: 'Success' });
});

module.exports = {
  bindEvent,
};
