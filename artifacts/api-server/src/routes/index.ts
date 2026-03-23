import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import jobsRouter from "./jobs";
import lmeRouter from "./lme";
import usersRouter from "./users";
import settingsRouter from "./settings";
import weightReferenceRouter from "./weight-reference";
import manufacturersRouter from "./manufacturers";
import stillagesRouter from "./stillages";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(jobsRouter);
router.use(lmeRouter);
router.use(usersRouter);
router.use(settingsRouter);
router.use(weightReferenceRouter);
router.use(manufacturersRouter);
router.use(stillagesRouter);

export default router;
