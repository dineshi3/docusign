const express = require('express');
const multer = require('multer');

const router = express.Router();
const emailController = require('../../controllers/email.controller');
const mongoService = require('../../services/mongodb.service')

const upload = multer({ storage: multer.memoryStorage() });

router.route('/receive').post(emailController.handleSendDocument);
router.route('/signDocument').post(upload.single('file'), emailController.handleSignDocument);

router.route('/docStatus').post(async (req, res) => {
    const { companyId, ticketId } = req.body;

    try {
        const docDetails = await mongoService.getRecordByCompanyIdAndTicketId(companyId, ticketId);
        res.status(200).json(docDetails);
    } catch (err) {
        console.error("Error while retrieving document details:", err);
        res.status(500).send("Internal Server Error");
    }
});



module.exports = router;
