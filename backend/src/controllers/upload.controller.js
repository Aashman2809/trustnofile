export const uploadController = (uploadService) => async (req, res, next) => {
  try { res.status(201).json({ file: await uploadService.process(req.file) }); } catch (e) { next(e); }
};
