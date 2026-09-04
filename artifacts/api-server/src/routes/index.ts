import { Router, type IRouter } from "express";
import healthRouter from "./health";
import controlCenterRouter from "./control-center";

const router: IRouter = Router();

router.use(healthRouter);
router.use(controlCenterRouter);

export default router;
