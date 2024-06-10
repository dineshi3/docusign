const axios = require('axios');
const moment = require('moment');

const mailgun = require('../config/emailer');
const config = require('../config/config');
const logger = require('../config/logger');

const templates = require('../templates');
const mongoService = require('../services/mongodb.service')


const { extractNameFromEmail } = require('./mail.service');

const getDocumentFile = async (documentId) => {
  const response = await axios.get(`${config.boldsign.host}/v1/document/download?documentId=${documentId}`, {
    headers: {
      'X-API-KEY': config.boldsign.key,
    },
    responseType: 'arraybuffer',
  });
  const signedDocumentData = response.data;
  return signedDocumentData;
};

const getViewDocumentLink = async ({ documentId, signerEmail }) => {
  try {
    const embeddedSignLinkResponse = await axios.get(
      `${config.boldsign.host}/v1/document/getEmbeddedSignLink?documentId=${documentId}&signerEmail=${signerEmail}&redirectUrl=${config.website.host}/e-sign/complete`,
      {
        headers: {
          accept: 'application/json',
          'X-API-KEY': config.boldsign.key,
          'Content-Type': 'application/json;odata.metadata=minimal;odata.streaming=true',
        },
      }
    );
    const signLink = embeddedSignLinkResponse.data?.signLink;
    return signLink;
  } catch (error) {
    if (error.response) logger.error(JSON.stringify(error.response.data));
    else logger.error(error.message);
    return '';
  }
};

const getAuditFile = async (documentId) => {
  const response = await axios.get(`${config.boldsign.host}/v1/document/downloadauditlog?documentId=${documentId}`, {
    headers: {
      'X-API-KEY': config.boldsign.key,
    },
    responseType: 'arraybuffer',
  });
  return response.data;
};

const sendSignedEmail = async ({ data }) => {
  const { metaData } = data;
  const signedDocumentData = await getDocumentFile(data.documentId);

  const signer = data.signerDetails
    .filter((signer) => signer.status === 'Completed')
    .reduce((firstSigner, currentSigner) => {
      if (!firstSigner || currentSigner.lastActivityDate > firstSigner.lastActivityDate) {
        return currentSigner;
      }
      return firstSigner;
    }, null);

  if (!signer) return;

  const documentLink = await getViewDocumentLink({ documentId: data.documentId, signerEmail: signer.signerEmail });

  const documentPrefix = `${metaData?.document.name ? `${metaData?.document.name}_` : ''}`;

  const requestData = {
    from: `Magicsign <sign@${config.mailgun.emailDomain}>`,
    to: signer.signerEmail,
    subject: `You have successfully signed ${data.messageTitle}`,
    html: templates.signedDocumentTemplate({
      ...metaData,
      ...data,
      documentLink: `${config.website.host}/e-sign/?${documentLink.split('?')[1]}}`,
    }),
    attachment: new mailgun.Attachment({
      data: signedDocumentData,
      filename: `${documentPrefix}signed.pdf`,
    }),
  };

  mailgun.messages().send(requestData, (error, body) => {
    if (error) logger.error(error);
    else logger.debug('Email sent successfully:', body);
  });
  const { from, to, subject, html } = requestData;
  const documentId = data.documentId;
  const { companyId, ticketId } = await mongoService.getRecordByDocumentId(documentId);
  mongoService.insertEmail({ from, to, subject, html, documentId, companyId, ticketId });
  return true;
};

const sendSignDocumentEmail = async ({ data }) => {
  const { signerDetails, ccDetails, metaData } = data;
  for (let signer of signerDetails) {
    const embeddedSignLinkResponse = await axios.get(
      `${config.boldsign.host}/v1/document/getEmbeddedSignLink?documentId=${data.documentId}&signerEmail=${signer.signerEmail}&redirectUrl=${config.website.host}/e-sign/complete`,
      {
        headers: {
          accept: 'application/json',
          'X-API-KEY': config.boldsign.key,
          'Content-Type': 'application/json;odata.metadata=minimal;odata.streaming=true',
        },
      }
    );
    const signLink = embeddedSignLinkResponse.data?.signLink;

    let message = `Review and Sign Document`;

    if (metaData) message = `${metaData.sender.name} has requested to e-sign the ${metaData.document.name}`;

    const requestConfig = {
      from: 'Magicsign <sign@esign-inc.vakilsearch.com>',
      to: signer.signerEmail,
      subject: `Review and Sign ${metaData?.document?.name || messageTitle}`,
      html: templates.signTemplate({
        ...metaData,
        signLink: `${config.website.host}/e-sign/?${signLink.split('?')[1]}}`,
        user: signer,
        signerDetails,
        senderDetails: [
          {
            senderName: metaData.sender?.name || extractNameFromEmail(ccDetails[0]?.emailAddress),
            senderEmail: metaData.sender?.email || ccDetails[0]?.emailAddress,
          },
        ],
        expiryDate: moment.unix(data.expiryDate).format('DD-MM-YYYY HH:mm'),
        title: data.messageTitle,
        message,
      }),
    };

    mailgun.messages().send(requestConfig, (error, body) => {
      if (error) logger.error(error);
      else logger.debug('Email sent successfully:', body);
    });

    const documentId = data.documentId;
    const { companyId, ticketId } = await mongoService.getRecordByDocumentId(documentId);
    mongoService.insertEmail({ ...requestConfig, documentId, companyId, ticketId });
    mongoService.setDocumentLink({ documentId, documentLink: signLink });
  }
};

const sendCompletedEmail = async ({ data }) => {
  const { signerDetails, ccDetails, documentId, metaData } = data;

  const signedUsers = signerDetails.filter((signer) => signer.status == 'Completed');

  const signedDocumentData = await getDocumentFile(documentId);
  const auditDocumentData = await getAuditFile(documentId);

  const users = [];

  if(signerDetails.length > 1)
    users.push(...signerDetails);

  const ccuser = ccDetails[0];
  if (ccuser) users.push({ signerEmail: ccuser.emailAddress, signerName: metaData?.sender?.name || extractNameFromEmail(ccuser.emailAddress), isSender: true });

  const documentPrefix = `${metaData?.document.name ? `${metaData?.document.name}_` : ''}`;
  const documentLink = await mongoService.getDocumentLink({ documentId });
  for (let user of users) {
    const requestConfig = {
      from: `Magicsign <sign@${config.mailgun.emailDomain}>`,
      to: user.signerEmail,
      subject: `${metaData?.document?.name || data.messageTitle} Document successfully signed and completed`,
      html: templates.completedDocumentTemplate({
        ...metaData,
        document: {
          ...metaData.document,
          ...data,
          signerDetails,
          documentLink: `${config.website.host}/e-sign/?${documentLink ? documentLink.split('?')[1] : `documentId=${data.documentId}`}`,
        },
        fromUser: user,
      }),
      attachment: [
        new mailgun.Attachment({
          data: signedDocumentData,
          filename: `${documentPrefix}signed_document.pdf`,
        }),
        new mailgun.Attachment({
          data: auditDocumentData,
          filename: `${documentPrefix}auditlog.pdf`,
        }),
      ],
    };

    mailgun.messages().send(requestConfig, (error, body) => {
      if (error) logger.error(error);
      else logger.debug('Email sent successfully:', body);
    });
    if(user.isSender){
      const { from, to, subject, html } = requestConfig;
      const documentId = data.documentId;
      const { companyId, ticketId } = await mongoService.getRecordByDocumentId(documentId);
      mongoService.insertEmail({ from, to, subject, html, documentId, companyId, ticketId });
    }
  }

  
  //Change status to completed in the mongoDB for the documentID
  mongoService.updateStatusByDocId(documentId,'signed')
};

module.exports = {
  sendSignedEmail,
  sendSignDocumentEmail,
  sendCompletedEmail,
};
