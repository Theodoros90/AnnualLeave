using Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace API.Controllers;

[ApiController]
[Route("api/timesheets/{timesheetId}/entries")]
[Authorize]
public class TimesheetEntriesController : ControllerBase
{
    private readonly AppDbContext _context;

    public TimesheetEntriesController(AppDbContext context)
    {
        _context = context;
    }

    private async Task RecalculateTotalHoursAsync(string timesheetId)
    {
        var timesheet = await _context.Timesheets.FindAsync(timesheetId);
        if (timesheet == null) return;

        var totalHours = await _context.TimesheetEntries
            .Where(e => e.TimesheetId == timesheetId)
            .SumAsync(e => e.HoursWorked);

        timesheet.TotalHours = totalHours;
        await _context.SaveChangesAsync();
    }

    // POST: api/timesheets/{timesheetId}/entries
    [HttpPost]
    public async Task<ActionResult<TimesheetEntry>> AddEntry(string timesheetId, TimesheetEntry entry)
    {
        if (timesheetId != entry.TimesheetId)
            return BadRequest("TimesheetId mismatch");

        _context.TimesheetEntries.Add(entry);
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex)
        {
            var inner = ex.InnerException != null ? ex.InnerException.Message : ex.Message;
            return StatusCode(500, new { error = "Database error", details = inner });
        }

        await RecalculateTotalHoursAsync(timesheetId);

        return CreatedAtAction(null, new { timesheetId, entryId = entry.Id }, entry);
    }

    // PUT: api/timesheets/{timesheetId}/entries/{entryId}
    [HttpPut("{entryId}")]
    public async Task<IActionResult> UpdateEntry(string timesheetId, string entryId, TimesheetEntry entry)
    {
        if (entryId != entry.Id || timesheetId != entry.TimesheetId)
            return BadRequest("Id or TimesheetId mismatch");

        _context.Entry(entry).State = EntityState.Modified;
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            if (!await _context.TimesheetEntries.AnyAsync(e => e.Id == entryId && e.TimesheetId == timesheetId))
                return NotFound();
            throw;
        }

        await RecalculateTotalHoursAsync(timesheetId);

        return NoContent();
    }

    // DELETE: api/timesheets/{timesheetId}/entries/{entryId}
    [HttpDelete("{entryId}")]
    public async Task<IActionResult> DeleteEntry(string timesheetId, string entryId)
    {
        var entry = await _context.TimesheetEntries
            .FirstOrDefaultAsync(e => e.Id == entryId && e.TimesheetId == timesheetId);
        if (entry == null) return NotFound();

        _context.TimesheetEntries.Remove(entry);
        await _context.SaveChangesAsync();

        await RecalculateTotalHoursAsync(timesheetId);

        return NoContent();
    }
}
