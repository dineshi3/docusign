const { MongoClient } = require('mongodb');

// Connection URL
const url = 'mongodb://localhost:27017';

// Database Name
const dbName = 'doc_signer';

// Collection Name
const collectionName = 'signedStatus';

// Function to create MongoDB database and collection if they don't exist
module.exports.createDatabase = async () => {
    const client = new MongoClient(url, { useUnifiedTopology: true });
    try {
        await client.connect();
        const adminDb = client.db().admin();
        const databases = await adminDb.listDatabases();
        const databaseExists = databases.databases.some(db => db.name === dbName);
        if (!databaseExists) {
            await adminDb.createDatabase(dbName);
            console.log(`Database '${dbName}' created successfully.`);
        } else {
            console.log(`Database '${dbName}' connected successfully.`);
        }

        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();
        const collectionExists = collections.some(collection => collection.name === collectionName);
        if (!collectionExists) {
            await db.createCollection(collectionName);
            console.log(`Collection '${collectionName}' created successfully in database '${dbName}'.`);
        } else {
            console.log(`Collection '${collectionName}' connected successfully in database '${dbName}'.`);
        }
    } catch (err) {
        console.error("Error while creating or checking database and collection:", err);
    } finally {
        await client.close();
    }
};


// Function to push records into MongoDB collection
module.exports.pushRecords = async (records) => {
    const client = new MongoClient(url, { useUnifiedTopology: true });
    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        // Insert one or multiple records into the collection
        const result = await collection.insertMany(records);
        console.log(`${result.insertedCount} record(s) inserted into collection '${collectionName}'.`);
    } catch (err) {
        console.error("Error while pushing records:", err);
    } finally {
        await client.close();
    }
};


module.exports.getRecordByCompanyIdAndTicketId = async (companyId, ticketId) => {
    console.log('companyID and TicketID method'+companyId, ticketId)
    const client = new MongoClient(url, { useUnifiedTopology: true });
    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        
        // Convert companyId and ticketId to strings
        const query = {
            'companyId': companyId,
            'ticketId': ticketId
        };

        // Find document matching companyId and ticketId
        const document = await collection.find(query);
        if (document) {
            console.log("Found document:", document);
            return document;
        } else {
            console.log("No records available for the provided companyId and ticketId.");
            return null;
        }
    } catch (err) {
        console.error("Error while retrieving record:", err);
        return null;
    } finally {
        await client.close();
    }
};

// Function to update the status in MongoDB collection based on documentId
module.exports.updateStatusByDocId = async (documentId, status) => {
    const client = new MongoClient(url, { useUnifiedTopology: true });
    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        // Update the status of the document with the provided documentId
        const result = await collection.updateOne({ documentId: documentId }, { $set: { status: status } });
        if (result.modifiedCount === 1) {
            console.log(`Status updated for document with docId ${documentId}.`);
        } else {
            console.log(`Document with documentId ${documentId} not found or status is already '${status}'.`);
        }
    } catch (err) {
        console.error("Error while updating status:", err);
    } finally {
        await client.close();
    }
};

module.exports.updateEmailsById = async (documentId, email) => {
    const client = new MongoClient(url, { useUnifiedTopology: true });
    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        // Update the status of the document with the provided documentId
        const result = await collection.updateOne({ documentId: documentId }, {
            $push: {
                emails: {
                    $each: [email],
                    $position: 0
                }
            }
        });
        if (result.modifiedCount === 1) {
            console.log(`Email updated for document with docId ${documentId}.`);
        } else {
            console.log(`Document with documentId ${documentId} not found`);
        }
    } catch (err) {
        console.error("Error while updating email:", err);
    } finally {
        await client.close();
    }
};

module.exports.updateDocumentById = async (documentId, document) => {
    const client = new MongoClient(url, { useUnifiedTopology: true });
    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        // Update the status of the document with the provided documentId
        const result = await collection.updateOne({ documentId: documentId }, {
            $set: {
                document
            }
        });
        if (result.modifiedCount === 1) {
            console.log(`Document updated with docId ${documentId}.`);
        } else {
            console.log(`Document with documentId ${documentId} not found`);
        }
    } catch (err) {
        console.error("Error while updating Document:", err);
    } finally {
        await client.close();
    }
};