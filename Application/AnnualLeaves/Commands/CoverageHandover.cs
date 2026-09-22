using Application.AnnualLeaves.DTOs;
using Domain;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// Copies the handover — the note and the document for the delegate — from a
/// request onto the leave, in one place for create and edit.
///
/// Both are written <em>to</em> the delegate, so a request naming nobody keeps
/// neither: a note stored against a leave with no cover would be shown to nobody
/// and mailed to nobody, and a full-replace edit that dropped the delegate would
/// otherwise strand it. Whitespace is stored as null, the same reading
/// <c>AttachmentPolicyRule</c> gives an evidence path.
/// </summary>
public static class CoverageHandover
{
    public static void Apply(AnnualLeave annualLeave, BaseAnnualLeaveDto request)
    {
        if (string.IsNullOrWhiteSpace(annualLeave.DelegateId))
        {
            annualLeave.CoverageNote = null;
            annualLeave.CoverageAttachmentUrl = null;
            return;
        }

        annualLeave.CoverageNote = string.IsNullOrWhiteSpace(request.CoverageNote)
            ? null
            : request.CoverageNote.Trim();
        annualLeave.CoverageAttachmentUrl = string.IsNullOrWhiteSpace(request.CoverageAttachmentUrl)
            ? null
            : request.CoverageAttachmentUrl.Trim();
    }
}
