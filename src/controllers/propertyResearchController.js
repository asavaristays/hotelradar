import {
  getPropertyResearchJob,
  listPropertyResearchJobs,
  runPropertyResearch,
} from '../services/propertyResearchService.js';
import { isUuid } from '../utils/validation.js';

export async function createResearch(req, res, next) {
  try {
    const requestedBy = isUuid(req.user?.id) ? req.user.id : null;
    const result = await runPropertyResearch({
      ...req.body,
      requestedBy,
    });
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getResearch(req, res, next) {
  try {
    const result = await getPropertyResearchJob(req.params.jobId);
    if (!result) {
      const error = new Error('Property research job not found.');
      error.status = 404;
      throw error;
    }
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function listResearch(req, res, next) {
  try {
    const jobs = await listPropertyResearchJobs(req.query);
    return res.json({ jobs });
  } catch (error) {
    return next(error);
  }
}
