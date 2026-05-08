using Microsoft.AspNetCore.Http;
using System.ComponentModel.DataAnnotations;

namespace API.DTOs
{
    public class UploadProfileImageDto
    {
        [Required]
        public IFormFile File { get; set; }
    }
}