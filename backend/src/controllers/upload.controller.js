export const uploadController = (uploadService, duplicateService) => async (req, res, next) => {
  try {
    const file = await uploadService.process(req.file);
    res.status(201).json({ file, priorAnalysis: await duplicateService.findPrior(file) });
  } catch (e) { next(e); }
};
