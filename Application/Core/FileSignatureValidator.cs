using System.Text;

namespace Application.Core;

/// <summary>
/// Magic-number (file signature) validation. Defends against bypasses that
/// rename or mislabel a file: a request can lie about the extension and the
/// Content-Type header, but the leading bytes of the actual payload cannot.
///
/// Lives in Application rather than Infrastructure because the upload handler
/// that needs it is a MediatR command, and Application cannot see Infrastructure.
///
/// The Office formats need a second look beyond the leading bytes. A .docx and
/// an .xlsx are both ZIP archives (<c>PK\x03\x04</c>), and a .doc and an .xls are
/// both OLE compound files, so the signature alone says "an Office file, or any
/// ZIP at all". Each of those four therefore also has a <em>marker</em>: a byte
/// string that has to occur somewhere in the content — the archive entry prefix
/// (<c>word/</c>, <c>xl/</c>) for the modern pair, the UTF-16 stream name
/// (<c>WordDocument</c>, <c>Workbook</c>) for the legacy one. A ZIP holding
/// neither is not a file we recognise, which is the answer we want for a
/// renamed archive.
/// </summary>
public static class FileSignatureValidator
{
    public enum FileKind
    {
        Jpeg,
        Png,
        Pdf,
        /// <summary>Word, .docx (Office Open XML).</summary>
        Docx,
        /// <summary>Excel, .xlsx (Office Open XML).</summary>
        Xlsx,
        /// <summary>Word, .doc (legacy binary).</summary>
        Doc,
        /// <summary>Excel, .xls (legacy binary).</summary>
        Xls,
    }

    private static readonly byte[] ZipSignature = [0x50, 0x4B, 0x03, 0x04];
    private static readonly byte[] OleSignature = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

    private static readonly Dictionary<FileKind, byte[][]> Signatures = new()
    {
        // JPEG: FF D8 FF, with the 4th byte varying across JFIF / EXIF / SPIFF.
        [FileKind.Jpeg] = [[0xFF, 0xD8, 0xFF]],
        // PNG: 89 50 4E 47 0D 0A 1A 0A.
        [FileKind.Png] = [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
        // PDF: %PDF-
        [FileKind.Pdf] = [[0x25, 0x50, 0x44, 0x46, 0x2D]],
        [FileKind.Docx] = [ZipSignature],
        [FileKind.Xlsx] = [ZipSignature],
        [FileKind.Doc] = [OleSignature],
        [FileKind.Xls] = [OleSignature],
    };

    /// <summary>
    /// For a kind whose signature it shares with another, the bytes that have to
    /// appear somewhere in the content to tell them apart. Absent for a kind whose
    /// signature is its own.
    /// </summary>
    private static readonly Dictionary<FileKind, byte[]> ContentMarkers = new()
    {
        [FileKind.Docx] = "word/"u8.ToArray(),
        [FileKind.Xlsx] = "xl/"u8.ToArray(),
        [FileKind.Doc] = Encoding.Unicode.GetBytes("WordDocument"),
        [FileKind.Xls] = Encoding.Unicode.GetBytes("Workbook"),
    };

    private static readonly Dictionary<FileKind, string> ContentTypes = new()
    {
        [FileKind.Jpeg] = "image/jpeg",
        [FileKind.Png] = "image/png",
        [FileKind.Pdf] = "application/pdf",
        [FileKind.Docx] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [FileKind.Xlsx] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        [FileKind.Doc] = "application/msword",
        [FileKind.Xls] = "application/vnd.ms-excel",
    };

    private static readonly Dictionary<FileKind, string[]> Extensions = new()
    {
        [FileKind.Jpeg] = [".jpg", ".jpeg"],
        [FileKind.Png] = [".png"],
        [FileKind.Pdf] = [".pdf"],
        [FileKind.Docx] = [".docx"],
        [FileKind.Xlsx] = [".xlsx"],
        [FileKind.Doc] = [".doc"],
        [FileKind.Xls] = [".xls"],
    };

    /// <summary>
    /// The kind whose signature the content actually starts with, or null when it
    /// matches nothing known. Deliberately scans every known kind rather than
    /// only the ones a caller will accept, so the caller can tell "that is not a
    /// file we recognise" apart from "that is a real PDF, but not here".
    /// </summary>
    public static FileKind? Detect(ReadOnlySpan<byte> content)
    {
        foreach (var (kind, signatures) in Signatures)
        {
            foreach (var signature in signatures)
            {
                if (content.Length < signature.Length
                    || !content[..signature.Length].SequenceEqual(signature))
                {
                    continue;
                }

                // A shared signature needs its marker too; without one this is
                // "some ZIP", not a Word document.
                if (ContentMarkers.TryGetValue(kind, out var marker)
                    && content.IndexOf(marker) < 0)
                {
                    continue;
                }

                return kind;
            }
        }

        return null;
    }

    /// <summary>The content type to serve this kind back as.</summary>
    public static string ContentTypeFor(FileKind kind) => ContentTypes[kind];

    /// <summary>File extensions legitimately carried by this kind.</summary>
    public static IReadOnlyList<string> ExtensionsFor(FileKind kind) => Extensions[kind];

    /// <summary>
    /// The kind a declared content type claims to be, or null when the value is
    /// absent or too vague to contradict anything (<c>application/octet-stream</c>
    /// is what browsers send when they cannot work out a type themselves).
    /// </summary>
    public static FileKind? KindForContentType(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
        {
            return null;
        }

        foreach (var (kind, value) in ContentTypes)
        {
            if (value.Equals(contentType, StringComparison.OrdinalIgnoreCase))
            {
                return kind;
            }
        }

        return null;
    }
}
