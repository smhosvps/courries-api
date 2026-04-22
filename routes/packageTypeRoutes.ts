// routes/packageTypeRoutes.js
import express from "express";
import { createPackageType, deletePackageType, getAllPackageTypes, getAllPackageTypesAdmin, getPackageType, hardDeletePackageType, seedDefaultPackageTypes, updatePackageType } from "../controlers/packageTypeController";


const packageRouter = express.Router();

// Public route - get all active package types
packageRouter.get('/package-get-public', getAllPackageTypes);


packageRouter.get('/package-get-admin', getAllPackageTypesAdmin);
packageRouter.get('/package-get/:id', getPackageType);
packageRouter.post('/package-create', createPackageType);
packageRouter.put('/package-update/:id', updatePackageType);
packageRouter.delete('/package-delete/:id', deletePackageType);
packageRouter.delete('/package-delete-hard/:id', hardDeletePackageType);
packageRouter.post('/seed/default', seedDefaultPackageTypes);

export default packageRouter;