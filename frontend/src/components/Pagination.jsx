// مكون التقسيم المشترك: نفس شكل meta بالباك (totalPages, hasNext, hasPrev)
function Pagination({ meta, page, onPage }) {
  if (!meta || !meta.totalPages || meta.totalPages <= 1) {
    return null;
  }

  return (
    <div className="pagination">
      <button
        className="btn btn-outline btn-small"
        disabled={!meta.hasPrev}
        onClick={() => onPage(page - 1)}
      >
        السابق
      </button>
      <span className="muted">
        صفحة {meta.page} من {meta.totalPages}
      </span>
      <button
        className="btn btn-outline btn-small"
        disabled={!meta.hasNext}
        onClick={() => onPage(page + 1)}
      >
        التالي
      </button>
    </div>
  );
}

export default Pagination;
