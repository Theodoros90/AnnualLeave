using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Persistence;
using Domain;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AnnualLeavesController : ControllerBase
{
    private readonly AppDbContext _context;

    public AnnualLeavesController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AnnualLeave>>> GetAnnualLeaves()
    {
        return await _context.AnnualLeaves.ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AnnualLeave>> GetAnnualLeave(string id)
    {
        var annualLeave = await _context.AnnualLeaves.FindAsync(id);

        if (annualLeave == null)
        {
            return NotFound();
        }

        return annualLeave;
    }

    [HttpPost]
    public async Task<ActionResult<AnnualLeave>> PostAnnualLeave(AnnualLeave annualLeave)
    {
        _context.AnnualLeaves.Add(annualLeave);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAnnualLeave), new { id = annualLeave.Id }, annualLeave);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutAnnualLeave(string id, AnnualLeave annualLeave)
    {
        if (id != annualLeave.Id)
        {
            return BadRequest();
        }

        _context.Entry(annualLeave).State = EntityState.Modified;

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            if (!AnnualLeaveExists(id))
            {
                return NotFound();
            }
            else
            {
                throw;
            }
        }

        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteAnnualLeave(string id)
    {
        var annualLeave = await _context.AnnualLeaves.FindAsync(id);
        if (annualLeave == null)
        {
            return NotFound();
        }

        _context.AnnualLeaves.Remove(annualLeave);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    private bool AnnualLeaveExists(string id)
    {
        return _context.AnnualLeaves.Any(e => e.Id == id);
    }
}