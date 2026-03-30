using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class NormalizeIdentityRolesToEmployeeManagerAdmin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.AspNetRoles WHERE Name = 'Admin')
BEGIN
    INSERT INTO dbo.AspNetRoles (Id, Name, NormalizedName, ConcurrencyStamp)
    VALUES (CONVERT(nvarchar(450), NEWID()), 'Admin', 'ADMIN', NULL);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.AspNetRoles WHERE Name = 'Manager')
BEGIN
    INSERT INTO dbo.AspNetRoles (Id, Name, NormalizedName, ConcurrencyStamp)
    VALUES (CONVERT(nvarchar(450), NEWID()), 'Manager', 'MANAGER', NULL);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.AspNetRoles WHERE Name = 'Employee')
BEGIN
    INSERT INTO dbo.AspNetRoles (Id, Name, NormalizedName, ConcurrencyStamp)
    VALUES (CONVERT(nvarchar(450), NEWID()), 'Employee', 'EMPLOYEE', NULL);
END;

DECLARE @ManagerRoleId nvarchar(450) = (SELECT TOP 1 Id FROM dbo.AspNetRoles WHERE Name = 'Manager');
DECLARE @EmployeeRoleId nvarchar(450) = (SELECT TOP 1 Id FROM dbo.AspNetRoles WHERE Name = 'Employee');
DECLARE @AuthorRoleId nvarchar(450) = (SELECT TOP 1 Id FROM dbo.AspNetRoles WHERE Name = 'Author');
DECLARE @ViewerRoleId nvarchar(450) = (SELECT TOP 1 Id FROM dbo.AspNetRoles WHERE Name = 'Viewer');

IF @AuthorRoleId IS NOT NULL
BEGIN
    INSERT INTO dbo.AspNetUserRoles (UserId, RoleId)
    SELECT ur.UserId, @ManagerRoleId
    FROM dbo.AspNetUserRoles ur
    WHERE ur.RoleId = @AuthorRoleId
      AND NOT EXISTS
      (
          SELECT 1
          FROM dbo.AspNetUserRoles x
          WHERE x.UserId = ur.UserId AND x.RoleId = @ManagerRoleId
      );

    DELETE FROM dbo.AspNetUserRoles WHERE RoleId = @AuthorRoleId;
    DELETE FROM dbo.AspNetRoles WHERE Id = @AuthorRoleId;
END;

IF @ViewerRoleId IS NOT NULL
BEGIN
    INSERT INTO dbo.AspNetUserRoles (UserId, RoleId)
    SELECT ur.UserId, @EmployeeRoleId
    FROM dbo.AspNetUserRoles ur
    WHERE ur.RoleId = @ViewerRoleId
      AND NOT EXISTS
      (
          SELECT 1
          FROM dbo.AspNetUserRoles x
          WHERE x.UserId = ur.UserId AND x.RoleId = @EmployeeRoleId
      );

    DELETE FROM dbo.AspNetUserRoles WHERE RoleId = @ViewerRoleId;
    DELETE FROM dbo.AspNetRoles WHERE Id = @ViewerRoleId;
END;

UPDATE dbo.AspNetRoles SET NormalizedName = UPPER(Name) WHERE Name IN ('Admin', 'Manager', 'Employee');

COMMIT TRANSACTION;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.AspNetRoles WHERE Name = 'Author')
BEGIN
    INSERT INTO dbo.AspNetRoles (Id, Name, NormalizedName, ConcurrencyStamp)
    VALUES (CONVERT(nvarchar(450), NEWID()), 'Author', 'AUTHOR', NULL);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.AspNetRoles WHERE Name = 'Viewer')
BEGIN
    INSERT INTO dbo.AspNetRoles (Id, Name, NormalizedName, ConcurrencyStamp)
    VALUES (CONVERT(nvarchar(450), NEWID()), 'Viewer', 'VIEWER', NULL);
END;

DECLARE @ManagerRoleId nvarchar(450) = (SELECT TOP 1 Id FROM dbo.AspNetRoles WHERE Name = 'Manager');
DECLARE @EmployeeRoleId nvarchar(450) = (SELECT TOP 1 Id FROM dbo.AspNetRoles WHERE Name = 'Employee');
DECLARE @AuthorRoleId nvarchar(450) = (SELECT TOP 1 Id FROM dbo.AspNetRoles WHERE Name = 'Author');
DECLARE @ViewerRoleId nvarchar(450) = (SELECT TOP 1 Id FROM dbo.AspNetRoles WHERE Name = 'Viewer');

IF @ManagerRoleId IS NOT NULL
BEGIN
    INSERT INTO dbo.AspNetUserRoles (UserId, RoleId)
    SELECT ur.UserId, @AuthorRoleId
    FROM dbo.AspNetUserRoles ur
    WHERE ur.RoleId = @ManagerRoleId
      AND NOT EXISTS
      (
          SELECT 1
          FROM dbo.AspNetUserRoles x
          WHERE x.UserId = ur.UserId AND x.RoleId = @AuthorRoleId
      );

    DELETE FROM dbo.AspNetUserRoles WHERE RoleId = @ManagerRoleId;
    DELETE FROM dbo.AspNetRoles WHERE Id = @ManagerRoleId;
END;

IF @EmployeeRoleId IS NOT NULL
BEGIN
    INSERT INTO dbo.AspNetUserRoles (UserId, RoleId)
    SELECT ur.UserId, @ViewerRoleId
    FROM dbo.AspNetUserRoles ur
    WHERE ur.RoleId = @EmployeeRoleId
      AND NOT EXISTS
      (
          SELECT 1
          FROM dbo.AspNetUserRoles x
          WHERE x.UserId = ur.UserId AND x.RoleId = @ViewerRoleId
      );

    DELETE FROM dbo.AspNetUserRoles WHERE RoleId = @EmployeeRoleId;
    DELETE FROM dbo.AspNetRoles WHERE Id = @EmployeeRoleId;
END;

UPDATE dbo.AspNetRoles SET NormalizedName = UPPER(Name) WHERE Name IN ('Admin', 'Author', 'Viewer');

COMMIT TRANSACTION;
");
        }
    }
}
