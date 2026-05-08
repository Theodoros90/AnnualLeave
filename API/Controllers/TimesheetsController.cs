using System.Security.Claims;
using Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Application.Timesheets.DTOs;
using Application.Timesheets.Queries;
using MediatR;
using Persistence;

namespace API.Controllers
{
    public class CreateTimesheetRequest
    {
        public DateTime PeriodStart { get; set; }
        public DateTime PeriodEnd { get; set; }
    }

    [ApiController]
    [Route("api/[controller]")]
    public class TimesheetsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IMediator _mediator;

        public TimesheetsController(AppDbContext context, IMediator mediator)
        {
            _context = context;
            _mediator = mediator;
        }

        // GET: api/timesheets
        [HttpGet]
        [Authorize]
        public async Task<ActionResult<List<TimesheetDto>>> GetTimesheets()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                         ?? User.FindFirstValue("sub")
                         ?? User.Identity?.Name
                         ?? string.Empty;
            var isAdmin = User.IsInRole("Admin");
            var isManager = User.IsInRole("Manager");

            return await _mediator.Send(new GetTimesheetList.Query
            {
                RequestingUserId = userId,
                IsAdmin = isAdmin,
                IsManager = isManager,
            });
        }

        // GET: api/timesheets/{id}
        [HttpGet("{id}")]
        [Authorize]
        public async Task<ActionResult<Timesheet>> GetTimesheet(string id)
        {
            var timesheet = await _context.Timesheets
                .Include(t => t.Entries)
                .FirstOrDefaultAsync(t => t.Id == id);
            if (timesheet == null) return NotFound();
            return timesheet;
        }

        // POST: api/timesheets
        [HttpPost]
        [Authorize]
        public async Task<ActionResult<TimesheetDto>> CreateTimesheet(CreateTimesheetRequest request)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                         ?? User.FindFirstValue("sub")
                         ?? User.Identity?.Name
                         ?? string.Empty;

            var employeeProfile = await _context.EmployeeProfiles
                .FirstOrDefaultAsync(ep => ep.UserId == userId);

            if (employeeProfile == null)
                return BadRequest("No employee profile found for the current user.");

            var timesheet = new Timesheet
            {
                Id = Guid.NewGuid().ToString(),
                EmployeeId = employeeProfile.Id,
                DepartmentId = employeeProfile.DepartmentId,
                PeriodStart = request.PeriodStart,
                PeriodEnd = request.PeriodEnd,
                Status = TimesheetStatus.Draft,
                TotalHours = 0,
                CreatedAt = DateTime.UtcNow,
            };

            _context.Timesheets.Add(timesheet);
            await _context.SaveChangesAsync();

            var user = await _context.Users.FindAsync(userId);
            var dto = new TimesheetDto
            {
                Id = timesheet.Id,
                EmployeeId = timesheet.EmployeeId,
                EmployeeName = user?.DisplayName ?? user?.UserName ?? timesheet.EmployeeId,
                DepartmentId = timesheet.DepartmentId,
                PeriodStart = timesheet.PeriodStart,
                PeriodEnd = timesheet.PeriodEnd,
                TotalHours = timesheet.TotalHours,
                Status = timesheet.Status.ToString(),
                SubmittedAt = timesheet.SubmittedAt,
                ApprovedAt = timesheet.ApprovedAt,
                CreatedAt = timesheet.CreatedAt,
            };

            return CreatedAtAction(nameof(GetTimesheet), new { id = timesheet.Id }, dto);
        }

        // PATCH: api/timesheets/{id}/submit
        [HttpPatch("{id}/submit")]
        [Authorize]
        public async Task<IActionResult> SubmitTimesheet(string id)
        {
            var timesheet = await _context.Timesheets.FindAsync(id);
            if (timesheet == null) return NotFound();

            if (timesheet.Status == TimesheetStatus.Rejected)
                timesheet.Status = TimesheetStatus.Resubmitted;
            else
                timesheet.Status = TimesheetStatus.Submitted;

            timesheet.SubmittedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // PATCH: api/timesheets/{id}/approve
        [HttpPatch("{id}/approve")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> ApproveTimesheet(string id)
        {
            var timesheet = await _context.Timesheets.FindAsync(id);
            if (timesheet == null) return NotFound();
            timesheet.Status = TimesheetStatus.Approved;
            timesheet.ApprovedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // PATCH: api/timesheets/{id}/reject
        [HttpPatch("{id}/reject")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> RejectTimesheet(string id)
        {
            var timesheet = await _context.Timesheets.FindAsync(id);
            if (timesheet == null) return NotFound();
            timesheet.Status = TimesheetStatus.Rejected;
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // GET: api/timesheets/{id}/history
        [HttpGet("{id}/history")]
        [Authorize]
        public async Task<ActionResult<IEnumerable<TimesheetStatusHistory>>> GetStatusHistory(string id)
        {
            var history = await _context.TimesheetStatusHistories
                .Where(h => h.TimesheetId == id)
                .ToListAsync();
            return history;
        }

        /// <summary>
        /// Admin only: Retrieves status history across all timesheets, filterable by employee, department, date range, and status transition.
        /// </summary>
        [HttpGet("/api/admin/timesheets/history")]
        [ProducesResponseType(typeof(IEnumerable<TimesheetStatusHistory>), 200)]
        [ProducesResponseType(403)]
        [Authorize(Roles = "Admin")]
        public async Task<ActionResult<IEnumerable<TimesheetStatusHistory>>> GetAllStatusHistories(
            [FromQuery] string? employeeId,
            [FromQuery] int? departmentId,
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] int? fromStatus,
            [FromQuery] int? toStatus)
        {
            var query = _context.TimesheetStatusHistories
                .Include(h => h.Timesheet)
                .AsQueryable();

            if (!string.IsNullOrEmpty(employeeId))
                query = query.Where(h => h.Timesheet!.EmployeeId == employeeId);
            if (departmentId.HasValue)
                query = query.Where(h => h.Timesheet!.DepartmentId == departmentId.Value);
            if (from.HasValue)
                query = query.Where(h => h.ChangedAt >= from.Value);
            if (to.HasValue)
                query = query.Where(h => h.ChangedAt <= to.Value);
            if (fromStatus.HasValue)
                query = query.Where(h => h.FromStatus == fromStatus.Value);
            if (toStatus.HasValue)
                query = query.Where(h => h.ToStatus == toStatus.Value);

            var result = await query.ToListAsync();
            return Ok(result);
        }

        /// <summary>
        /// Retrieves all status history entries across all timesheets for a specific employee. Scoped by role.
        /// </summary>
        [HttpGet("/api/employees/{employeeId}/timesheets/history")]
        [ProducesResponseType(typeof(IEnumerable<TimesheetStatusHistory>), 200)]
        [ProducesResponseType(403)]
        [Authorize]
        public async Task<ActionResult<IEnumerable<TimesheetStatusHistory>>> GetEmployeeStatusHistories(string employeeId)
        {
            var isAdmin = User.IsInRole("Admin");
            var userId = User.Identity?.Name;

            if (!isAdmin && userId != employeeId)
                return Forbid();

            var histories = await _context.TimesheetStatusHistories
                .Include(h => h.Timesheet)
                .Where(h => h.Timesheet!.EmployeeId == employeeId)
                .ToListAsync();
            return Ok(histories);
        }
    }
}
