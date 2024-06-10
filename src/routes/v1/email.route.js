const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');


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
        res.status(200).json({
            status: true,
            message: 'Emails fetched successfully',
            data: docDetails
        });
    } catch (err) {
        console.error("Error while retrieving document details:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Define the route with multer middleware to handle file uploads
router.post('/extractPassport', upload.single('file'), async (req, res) => {
    try {
        // Check if the file was uploaded
        if (!req.file) {
            return res.status(400).send('No file uploaded');
        }

        console.log(`Uploaded filename: ${req.file.originalname}`);

        // Delay for at least 4 seconds
        setTimeout(() => {
            // Send the response based on the uploaded file's name
            if (req.file.originalname === 'passport_1.jpg') {
                return res.json({
                    success: true,
                    data: {
                        name: "SUHAS",
                        surname: "SHYAMSUNDER KOLEKER",
                        passportNumber: "R1235087",
                        city: "BENGALURU",
                        state: "KARNATAKA",
                        dob: "27/09/1988",
                    }
                });
            } else if (req.file.originalname === 'passport_2.jpg') {
                return res.json({
                    success: true,
                    data: {
                        name: "ARUN PETER",
                        surname: "KUMAR",
                        passportNumber: "Z6895519",
                        city: "BENGALURU",
                        state: "KARNATAKA",
                        dob: "28/12/1986",
                    }
                });
            } else {
                return res.status(404).json({ success: false, message: 'File not recognized' });
            }
        }, 4000); // 4 seconds delay
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'An error occurred' });
    }
});


module.exports = router;
