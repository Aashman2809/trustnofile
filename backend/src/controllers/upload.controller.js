

// Uploads controller.
export const uploadController = (uploadService, duplicateService) =>/* Handles the callback for this operation. */ async (req, res, next) => {
  try {
    const file = await uploadService.process(req.file);
    res.status(201).json({ file, priorAnalysis: await duplicateService.findPrior(file) });
  } catch (e) { next(e); }
};
