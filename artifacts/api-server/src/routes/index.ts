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
import cellModelsRouter from "./cell-models";
import collectionPointsRouter from "./collection-points";
import depotsRouter from "./depots";
import clientsRouter from "./clients";
import locationsRouter from "./locations";
import kpiRouter from "./kpi";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(jobsRouter);
router.use(kpiRouter);
router.use(lmeRouter);
router.use(usersRouter);
router.use(settingsRouter);
router.use(weightReferenceRouter);
router.use(manufacturersRouter);
router.use(stillagesRouter);
router.use(cellModelsRouter);
router.use(collectionPointsRouter);
router.use(depotsRouter);
router.use(clientsRouter);
router.use(locationsRouter);

export default router;
