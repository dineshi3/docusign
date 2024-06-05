const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const httpStatus = require('http-status');

const ApiError = require('../utils/ApiError');
const { toTitleCase } = require('../utils');

const logger = require('../config/logger');
const config = require('../config/config');
const mailgun = require('../config/emailer');
const templates = require('../templates');
const mongoService = require('../services/mongodb.service')


const baseDir = path.resolve(__dirname, '..');

const extractNameFromEmail = (email) => {
  const name = email.replace(/"/g, '').trim();
  if (name.includes('@')) return toTitleCase(name.split('@')[0]);
  return toTitleCase(name);
};

const extractUser = (email) => {
  logger.info(email);
  const splitted = email.includes('&lt;') ? email.split('&lt;') : email.split('<');
  const signUser = {
    signerName: splitted[1] == null ? toTitleCase(splitted[0].split('@')[0]) : extractNameFromEmail(splitted[0]),
    signerEmail: (splitted[1] || splitted[0]).replace(/"/g, '').replace(/>/g, '').trim(),
  };
  return signUser;
};

const parseEmailData = (requestData) => {
  const { Cc, attachments, Subject } = requestData;
  const From = requestData?.from || requestData?.From;

  if (!From) throw new ApiError(httpStatus.BAD_REQUEST, 'Sender details not found');

  const fromUser = extractUser(From);

  const signers = Cc.split(',').map((email) => extractUser(email));

  if (signers.length === 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Include at least one receiver');

  const attachment = attachments ? JSON.parse(attachments)[0] : null;
  if (!attachment) throw new ApiError(httpStatus.BAD_REQUEST, 'Attachment not found');

  return { from: From, fromUser, signers, attachment, subject: Subject };
};

const getAttachmentFile = async (attachment) => {
  const fileRequestConfig = {
    method: 'get',
    maxBodyLength: Infinity,
    url: attachment.url,
    headers: {
      Authorization: `Basic ${config.mailgun.accessKey}`,
    },
    responseType: 'arraybuffer',
  };

  const response = await axios.request(fileRequestConfig);
  return response.data;
};

const createEmbeddedDocument = async ({ attachmentData, subject, attachment, fromUser, signers, metaDetails }) => {
  const data = new FormData();
  data.append('Files', Buffer.from(attachmentData), {
    filename: attachment.name,
    contentType: attachment['content-type'],
  });

  data.append('Title', metaDetails?.document.name);
  data.append('ShowToolbar', 'true');
  data.append('ShowNavigationButtons', 'true');
  data.append('ShowPreviewButton', 'true');
  data.append('ShowSendButton', 'true');
  data.append('ShowSaveButton', 'true');
  data.append('SendViewOption', 'PreparePage');
  data.append('disableEmails', 'true');
  data.append('Locale', 'EN');
  data.append('RedirectUrl', `${config.website.host}/e-sign/marker-complete`);
  data.append('Message', JSON.stringify(metaDetails));
  data.append('EnableSigningOrder', 'false');
  data.append('senderDetail.name', fromUser.signerName);
  data.append('senderDetail.emailAddress', fromUser.signerEmail);
  // data.append('onBehalfOf', fromUser.signerEmail);
  signers.forEach((signUser, index) => {
    data.append(`Signers[${index}][Name]`, signUser.signerName);
    data.append(`Signers[${index}][EmailAddress]`, signUser.signerEmail);
    data.append(`Signers[${index}][PrivateMessage]`, subject);
  });

  data.append(`CC[0][Name]`, fromUser.signerName);
  data.append(`CC[0][EmailAddress]`, fromUser.signerEmail);

  const requestConfig = {
    method: 'post',
    maxBodyLength: Infinity,
    url: `${config.boldsign.host}/v1/document/createEmbeddedRequestUrl`,
    headers: {
      'X-API-KEY': config.boldsign.key,
      ...data.getHeaders(),
    },
    data: data,
  };

  const documentResponse = await axios.request(requestConfig);
  return documentResponse.data;
};

const sendDocumentLink = async ({ subject, sendUrl, fromUser, signers, metaDetails }) => {
  const emailConfig = {
    from: `Magicsign <sign@${config.mailgun.emailDomain}>`,
    to: fromUser.signerEmail,
    subject: 'Create Sign Markers',
    html: templates.createSignTemplate({
      ...metaDetails,
      signLink: `${config.website.host}/e-sign/view?${sendUrl.split('?')[1]}`,
      user: {
        ...fromUser,
        roleIndex: 1,
      },
      signerDetails: signers,
      senderDetails: [
        {
          senderName: fromUser.signerEmail,
          senderEmail: fromUser.signerName,
        },
      ],
      subject,
    }),
  };

  mailgun.messages().send(emailConfig, (error, body) => {
    if (error) logger.error(error);
    else logger.info('Email sent successfully:', body);
  });
};

const createSenderIdentity = async (sender) => {
  try {
    const requestConfig = {
      method: 'post',
      url: `${config.boldsign.host}/v1/senderIdentities/create`,
      headers: {
        'X-API-KEY': config.boldsign.key,
      },
      data: sender,
    };

    await axios.request(requestConfig);
  } catch (error) {
    if (error.response) logger.error(JSON.stringify(error.response.data));
    else logger.error(error);
  }
};

const createAndSendDocument = async (requestData) => {
  logger.info(JSON.stringify(requestData));
  const emailData = parseEmailData(requestData);
  const { subject, fromUser, signers, attachment } = emailData;

  const metaDetails = {
    sender: {
      name: fromUser.signerName,
      email: fromUser.signerEmail,
    },
    document: {
      name: toTitleCase(attachment.name.split('.')?.[0] || ''),
    },
    email: {
      subject,
    },
  };

  // createSenderIdentity(metaDetails.sender);
  const attachmentData = await getAttachmentFile(attachment);
  const { sendUrl } = await createEmbeddedDocument({ ...emailData, metaDetails, attachmentData });

  sendDocumentLink({ metaDetails, subject, sendUrl, fromUser, signers });
};

const getEmailData = (emailData) => {
  const { from, to, attachment, subject, fileName, companyId, ticketId } = emailData;

  if (!from) throw new ApiError(httpStatus.BAD_REQUEST, 'From email not found');
  if (!to) throw new ApiError(httpStatus.BAD_REQUEST, 'To email not found');
  if (!attachment) throw new ApiError(httpStatus.BAD_REQUEST, 'Attachment not found');
  if (!companyId) throw new ApiError(httpStatus.BAD_REQUEST, 'companyId not found');
  if (!ticketId) throw new ApiError(httpStatus.BAD_REQUEST, 'ticketId not found');

  const fromUser = {
    signerName: `${toTitleCase(from.split('@')[0])}`,
    signerEmail: from
  };

  const signers = [{ signerName: toTitleCase(to.split('@')[0]), signerEmail: to }]

  if (signers.length === 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Include at least one receiver');


  return { fromUser, signers, attachment, subject, fileName, companyId, ticketId };
};

const initiateSignDocument = async (requestData) => {

  const emailData = getEmailData(requestData);
  const { subject = 'eSign PDF Request', fromUser, signers, attachment, fileName, companyId, ticketId } = emailData;

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

  const { documentId, sendUrl } = await createEmbeddedDocument({ ...emailData, metaDetails, attachment: { name: attachment.originalname, 'content-type': attachment.mimetype }, attachmentData: attachment.buffer });

  sendDocumentLink({ metaDetails, subject, sendUrl, fromUser, signers });

  // push docDetails to mongoDb
  const docDetails = [{ companyId, ticketId, fromUser, signers, subject, fileName, documentId, sendUrl, status: 'draft' }]
  mongoService.pushRecords(docDetails)
};

module.exports = {
  createAndSendDocument,
  extractNameFromEmail,
  initiateSignDocument,
};
