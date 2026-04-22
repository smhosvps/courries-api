import express from 'express';
import { createDeliveryOption, deleteDeliveryOption, getAllDeliveryOptions, updateDeliveryOption } from '../controlers/deliveryOptionController';

const deliveryOptionRouter = express.Router();

deliveryOptionRouter.get('/get-all-delivery-option', getAllDeliveryOptions);
deliveryOptionRouter.post('/create-delivery-option', createDeliveryOption);
deliveryOptionRouter.put('/edit-delivery-option/:id', updateDeliveryOption);
deliveryOptionRouter.delete('/delete-delivery-option/:id', deleteDeliveryOption);

export default deliveryOptionRouter;