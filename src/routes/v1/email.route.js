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

        console.log(`Uploaded filename: ${req.body.file}`);

        // Delay for at least 4 seconds
        setTimeout(() => {
            // Send the response based on the uploaded file's name
            if (req.body.file === 'passport_1.jpg') {
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
            } else if (req.body.file === 'passport_2.jpg') {
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
            } else if (req.body.file === 'passport_3.jpg') {
                return res.json({
                    success: true,
                    data: {
                        name: "MOHAMMAD SAAD",
                        surname: "YAZDANI",
                        passportNumber: "Z4853842",
                        city: "BIJNOR, UTTARPRADESH",
                        state: "DELHI",
                        dob: "26/03/1995",
                    }
                });
            } else if (req.body.file === 'passport_4.jpg') {
                return res.json({
                    success: true,
                    data: {
                        name: "GURMEHR",
                        surname: "MARWAH",
                        passportNumber: "Z4966339",
                        city: "LUCKNOW, UTTARPRADESH",
                        state: "DELHI",
                        dob: "22/01/1997",
                    }
                });
            }else {
                return res.status(404).json({ success: false, message: 'File not recognized' });
            }
        }, 4000); // 4 seconds delay
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'An error occurred' });
    }
});




module.exports = router;
